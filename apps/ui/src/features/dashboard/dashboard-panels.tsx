// Port of ~/Documents/portal/src/page_dashboard.jsx (sub-sections) — visual fidelity verified 2026-04-20.
// Dashboard panel components — System status / Gas wallets / SLA / Compliance / Alerts.
// Split from dashboard-page.tsx to keep each file under 200 LOC.
import { type OpsHealth, useComplianceSummary, useOpsHealth, useSlaSummary } from '@/api/queries';
import { ChainPill } from '@/components/custody';
import { I } from '@/icons';
import type { NotificationPayload } from '@wp/shared-types';
import { useTranslation } from 'react-i18next';
import { LiveDot, LiveTimeAgo } from '../_shared/realtime';
import { useNotifications } from '../notifs/use-notifications';

// ── Helpers ───────────────────────────────────────────────────────────────────

function probeVariant(status: string): 'ok' | 'warn' | 'err' {
  return status === 'ok' ? 'ok' : 'err';
}

function workerVariant(agoSec: number | null): 'ok' | 'warn' | 'err' {
  if (agoSec === null) return 'err';
  if (agoSec < 60) return 'ok';
  if (agoSec < 300) return 'warn';
  return 'err';
}

function queueVariant(depth: number, status: string): 'ok' | 'warn' | 'err' {
  if (status !== 'ok') return 'err';
  if (depth > 100) return 'err';
  if (depth > 20) return 'warn';
  return 'ok';
}

function buildStatusRows(
  health: OpsHealth
): { name: string; variant: 'ok' | 'warn' | 'err'; meta: string }[] {
  const rows: { name: string; variant: 'ok' | 'warn' | 'err'; meta: string }[] = [];

  // Core services
  rows.push({
    name: 'Postgres',
    variant: probeVariant(health.db.status),
    meta: health.db.error ?? 'connected',
  });
  rows.push({
    name: 'Redis · queue',
    variant: probeVariant(health.redis.status),
    meta: health.redis.error ?? 'connected',
  });
  rows.push({
    name: 'Policy engine',
    variant: probeVariant(health.policyEngine.status),
    meta: health.policyEngine.error ?? 'online',
  });

  // Chains
  for (const c of health.chains) {
    const lag = c.lagBlocks ?? 0;
    const block = c.latestBlock?.toLocaleString() ?? '—';
    const meta = `block ${block} · lag ${lag} blk${c.error ? ` · ${c.error}` : ''}`;
    rows.push({ name: `${c.id.toUpperCase()} RPC`, variant: probeVariant(c.status), meta });
  }

  // Workers
  for (const w of health.workers) {
    const ago = w.lastHeartbeatAgoSec;
    const meta =
      ago === null ? 'no heartbeat' : `last tick ${ago}s ago${w.error ? ` · ${w.error}` : ''}`;
    rows.push({ name: w.name, variant: workerVariant(ago), meta });
  }

  // Queues
  for (const q of health.queues) {
    const meta = `depth ${q.depth}${q.error ? ` · ${q.error}` : ''}`;
    rows.push({ name: `${q.name} queue`, variant: queueVariant(q.depth, q.status), meta });
  }

  return rows;
}

// ── Panels ────────────────────────────────────────────────────────────────────

export function SystemStatusList() {
  const { data: health, isLoading } = useOpsHealth();

  if (isLoading || !health) {
    return (
      <div className="status-list">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="status-row skeleton-row" />
        ))}
      </div>
    );
  }

  const rows = buildStatusRows(health);

  return (
    <div className="status-list">
      {rows.map((s) => (
        <div key={s.name} className="status-row">
          <LiveDot variant={s.variant} />
          <span className="status-name">{s.name}</span>
          <span className="status-meta text-mono text-xs text-muted">{s.meta}</span>
        </div>
      ))}
    </div>
  );
}

export function GasWalletList() {
  const { t } = useTranslation();
  const { data: health, isLoading } = useOpsHealth();

  // Gas wallet native-token balances (BNB/SOL) are not exposed by /cold/balances
  // (which only returns USDT/USDC). Until a dedicated /ops/gas-wallets endpoint
  // is added (tracked in roadmap), we derive RPC status from health and show
  // chain connectivity as a proxy for operational readiness.
  if (isLoading || !health) {
    return (
      <div className="gas-list">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="gas-row skeleton-row" />
        ))}
      </div>
    );
  }

  // Per-chain lag thresholds: BNB ~3s/blk so 50 blk ≈ 2.5min; SOL ~0.4s/slot so 200 slots ≈ 1.5min.
  const chainRows = health.chains.map((c) => {
    const chainId = c.id.toLowerCase().startsWith('sol') ? 'sol' : ('bnb' as const);
    const lag = c.lagBlocks ?? 0;
    const lagThreshold = chainId === 'sol' ? 200 : 50;
    const idle = Boolean(c.watcherIdle);
    const isError = c.status !== 'ok';
    // Real chain lag only counts when watcher is actively advancing checkpoints
    const isLagWarn = !idle && !isError && lag > lagThreshold;
    return {
      chain: chainId as 'bnb' | 'sol',
      name: `${c.id.toUpperCase()} RPC`,
      lag,
      status: c.status,
      idle,
      isError,
      isLagWarn,
      checkpointBlock: c.checkpointBlock,
    };
  });

  return (
    <div className="gas-list">
      {chainRows.map((g) => {
        const cls = g.isError ? 'text-err' : g.idle || g.isLagWarn ? 'text-warn' : 'text-ok';
        const label = g.isError
          ? t('dashboard.gasDegraded')
          : g.idle
            ? t('dashboard.gasWatcherIdle')
            : g.isLagWarn
              ? t('dashboard.gasDegraded')
              : t('dashboard.gasHealthy');
        const meta = g.idle
          ? t('dashboard.gasIdleStatus', {
              block: g.checkpointBlock?.toLocaleString() ?? '—',
            })
          : t('dashboard.gasLagStatus', { lag: g.lag, status: g.status });
        return (
          <div key={g.name} className="gas-row">
            <ChainPill chain={g.chain} />
            <div className="gas-info">
              <div className="gas-name">{g.name}</div>
              <div className="gas-meta text-xs text-muted text-mono">{meta}</div>
            </div>
            <div className="gas-bal">
              <span className={`text-mono fw-600 text-xs ${cls}`}>{label}</span>
            </div>
          </div>
        );
      })}
      <div className="gas-row" style={{ opacity: 0.55, fontSize: 11 }}>
        <span className="text-muted text-xs">{t('dashboard.gasNativeHint')}</span>
      </div>
    </div>
  );
}

interface SLAProps {
  label: string;
  target: string;
  actual: string;
  pct: number;
  ok?: boolean;
}
function SLACell({ label, target, actual, pct, ok = true }: SLAProps) {
  return (
    <div className="sla-cell">
      <div className="sla-label text-xs text-muted">{label}</div>
      <div className="sla-value text-mono fw-600">{actual}</div>
      <div className="sla-meta text-xs text-faint">target {target}</div>
      <div className="sla-bar">
        <div className={`sla-bar-fill ${ok ? 'ok' : 'warn'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Format seconds into human-readable string, e.g. 75 → "1m 15s" */
function fmtSec(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Compute compliance % bar: actual/target capped 0-100 */
function slaBarPct(actualSec: number | null, targetSec: number): number {
  if (actualSec === null) return 0;
  // For latency metrics: lower is better; bar shows proximity to target
  const ratio = Math.min(actualSec / targetSec, 1);
  return Math.round((1 - ratio) * 100);
}

export function SLAGrid() {
  const { t } = useTranslation();
  const { data: sla, isLoading } = useSlaSummary();

  if (isLoading) {
    return (
      <div className="sla-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="sla-cell skeleton-row" />
        ))}
      </div>
    );
  }

  const depositSec = sla?.depositCreditP50Sec ?? null;
  const sweepSec = sla?.sweepConfirmP50Sec ?? null;

  return (
    <div className="sla-grid">
      <SLACell
        label={t('dashboard.slaDepositCreditP50')}
        target="< 60s"
        actual={fmtSec(depositSec)}
        pct={slaBarPct(depositSec, 60)}
        ok={depositSec === null || depositSec < 60}
      />
      <SLACell
        label={t('dashboard.slaSweepConfirmP50')}
        target="< 5m"
        actual={fmtSec(sweepSec)}
        pct={slaBarPct(sweepSec, 300)}
        ok={sweepSec === null || sweepSec < 300}
      />
      <SLACell
        label={t('dashboard.slaPendingDeposits')}
        target="< 50"
        actual={String(sla?.pendingDeposits ?? '—')}
        pct={Math.min(100, Math.round(((sla?.pendingDeposits ?? 0) / 50) * 100))}
        ok={(sla?.pendingDeposits ?? 0) < 50}
      />
      <SLACell
        label={t('dashboard.slaPendingSweeps')}
        target="< 20"
        actual={String(sla?.pendingSweeps ?? '—')}
        pct={Math.min(100, Math.round(((sla?.pendingSweeps ?? 0) / 20) * 100))}
        ok={(sla?.pendingSweeps ?? 0) < 20}
      />
      <SLACell
        label={t('dashboard.slaPendingWithdrawals')}
        target="< 10"
        actual={String(sla?.pendingWithdrawals ?? '—')}
        pct={Math.min(100, Math.round(((sla?.pendingWithdrawals ?? 0) / 10) * 100))}
        ok={(sla?.pendingWithdrawals ?? 0) < 10}
      />
      <SLACell
        label={t('dashboard.sla24hDeposits')}
        target={t('dashboard.slaRealTime')}
        actual={String(sla?.depositsLast24h ?? '—')}
        pct={100}
      />
    </div>
  );
}

export function ComplianceList() {
  const { data: comp, isLoading } = useComplianceSummary();

  if (isLoading) {
    return (
      <div className="compliance-list">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="compliance-row skeleton-row" />
        ))}
      </div>
    );
  }

  const rows: { label: string; value: string; meta: string; variant: 'ok' | 'warn' }[] = comp
    ? [
        {
          label: 'KYC None',
          value: String(comp.kycNone),
          meta: `of ${comp.totalUsers} total users`,
          variant: comp.kycNone > comp.totalUsers * 0.3 ? 'warn' : 'ok',
        },
        {
          label: 'KYC Basic (T1)',
          value: String(comp.kycBasic),
          meta: `${comp.totalUsers > 0 ? Math.round((comp.kycBasic / comp.totalUsers) * 100) : 0}% of users`,
          variant: 'ok',
        },
        {
          label: 'KYC Enhanced (T3)',
          value: String(comp.kycEnhanced),
          meta: `${comp.totalUsers > 0 ? Math.round((comp.kycEnhanced / comp.totalUsers) * 100) : 0}% of users`,
          variant: 'ok',
        },
        {
          label: 'Risk: High / Frozen',
          value: `${comp.riskHigh + comp.riskFrozen}`,
          meta: `high: ${comp.riskHigh} · frozen: ${comp.riskFrozen}`,
          variant: comp.riskHigh + comp.riskFrozen > 0 ? 'warn' : 'ok',
        },
        {
          label: 'Suspended users',
          value: String(comp.suspendedUsers),
          meta: `active: ${comp.activeUsers}`,
          variant: comp.suspendedUsers > 0 ? 'warn' : 'ok',
        },
      ]
    : [];

  return (
    <div className="compliance-list">
      {rows.map((c, i) => (
        <div key={i} className="compliance-row">
          <div className="compliance-main">
            <div className="compliance-label">{c.label}</div>
            <div className="compliance-meta text-xs text-muted">{c.meta}</div>
          </div>
          <span className={`compliance-val ${c.variant}`}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}

function severityToAlertClass(severity: NotificationPayload['severity']): string {
  if (severity === 'critical') return 'alert-err';
  if (severity === 'warning') return 'alert-warn';
  return 'alert-info';
}

function severityIcon(severity: NotificationPayload['severity']) {
  if (severity === 'critical') return <I.AlertTri size={11} />;
  if (severity === 'warning') return <I.AlertTri size={11} />;
  return <I.Info size={11} />;
}

export function AlertsList() {
  const { t } = useTranslation();
  // Fetch latest 20 notifications, surface critical + warning unread ones first
  const { data, isLoading } = useNotifications(20);

  if (isLoading) {
    return (
      <div className="alert-list">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="alert-compact skeleton-row" />
        ))}
      </div>
    );
  }

  const notifs = data?.data ?? [];

  // Hide critical/warning alerts older than 1h from the priority view — stale degradations
  // routinely linger as unread when ops don't acknowledge them; the dedicated /notifs page
  // still surfaces the full history.
  const PRIORITY_FRESHNESS_MS = 60 * 60 * 1000;
  const cutoff = Date.now() - PRIORITY_FRESHNESS_MS;
  const critical = notifs
    .filter((n) => {
      if (n.severity !== 'critical' && n.severity !== 'warning') return false;
      if (n.readAt) return false;
      const ts = new Date(n.createdAt).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    })
    .slice(0, 5);
  const displayed = critical.length > 0 ? critical : notifs.slice(0, 5);

  if (displayed.length === 0) {
    return (
      <div className="alert-list">
        <div className="alert-compact alert-info">
          <div className="alert-compact-head">
            <I.Check size={11} />
            <span className="alert-compact-title">{t('dashboard.noActiveAlerts')}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="alert-list">
      {displayed.map((n) => (
        <div key={n.id} className={`alert-compact ${severityToAlertClass(n.severity)}`}>
          <div className="alert-compact-head">
            {severityIcon(n.severity)}
            <span className="alert-compact-title">{n.title}</span>
            <span className="text-xs text-faint text-mono">
              <LiveTimeAgo at={n.createdAt} />
            </span>
          </div>
          {n.body && <div className="alert-compact-text">{n.body}</div>}
        </div>
      ))}
    </div>
  );
}
