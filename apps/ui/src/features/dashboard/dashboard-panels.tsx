// Port of ~/Documents/portal/src/page_dashboard.jsx (sub-sections) — visual fidelity verified 2026-04-20.
// Dashboard panel components — System status / Gas wallets / SLA / Compliance / Alerts.
// Split from dashboard-page.tsx to keep each file under 200 LOC.
import { type OpsHealth, useOpsHealth } from '@/api/queries';
import { ChainPill } from '@/components/custody';
import { I } from '@/icons';
import type { NotificationPayload } from '@wp/shared-types';
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

  const chainRows = health.chains.map((c) => {
    const chainId = c.id.toLowerCase().startsWith('sol') ? 'sol' : ('bnb' as const);
    const lag = c.lagBlocks ?? 0;
    const isWarn = c.status !== 'ok' || lag > 5;
    return {
      chain: chainId as 'bnb' | 'sol',
      name: `${c.id.toUpperCase()} RPC`,
      lag,
      status: c.status,
      isWarn,
    };
  });

  return (
    <div className="gas-list">
      {chainRows.map((g) => (
        <div key={g.name} className="gas-row">
          <ChainPill chain={g.chain} />
          <div className="gas-info">
            <div className="gas-name">{g.name}</div>
            <div className="gas-meta text-xs text-muted text-mono">
              lag {g.lag} blk · status {g.status}
            </div>
          </div>
          <div className="gas-bal">
            <span className={`text-mono fw-600 text-xs ${g.isWarn ? 'text-err' : 'text-ok'}`}>
              {g.isWarn ? 'degraded' : 'healthy'}
            </span>
          </div>
        </div>
      ))}
      <div className="gas-row" style={{ opacity: 0.55, fontSize: 11 }}>
        <span className="text-muted text-xs">
          Native gas balances (BNB/SOL) available once /ops/gas-wallets endpoint is added.
        </span>
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

// SLA targets are contractual/operational targets — not derived from real-time data.
// Real SLA tracking would require a dedicated time-series endpoint (not in scope).
export function SLAGrid() {
  return (
    <div className="sla-grid">
      <SLACell label="Deposit credit time" target="< 60s" actual="38s" pct={92} />
      <SLACell label="Sweep latency" target="< 5m" actual="3m 12s" pct={88} />
      <SLACell label="Withdrawal TAT" target="< 2h" actual="1h 04m" pct={96} />
      <SLACell label="RPC uptime" target="99.9%" actual="99.97%" pct={99} />
      <SLACell label="Reconciliation" target="100%" actual="100%" pct={100} />
      <SLACell label="Job retries" target="< 2%" actual="0.8%" pct={94} />
    </div>
  );
}

// Compliance checks are currently policy-only (AML, sanctions) — no live API endpoint
// provides these aggregates. Retains static display until a /compliance/summary
// endpoint is implemented.
export function ComplianceList() {
  const rows: { label: string; value: string; meta: string; variant: 'ok' | 'warn' }[] = [
    { label: 'AML screening', value: '0 hits', meta: '240 addrs scanned · last 6m', variant: 'ok' },
    { label: 'Sanctions', value: 'Clear', meta: 'updated 2h ago', variant: 'ok' },
    { label: 'Travel rule', value: 'N/A', meta: 'all transfers < $3k threshold', variant: 'ok' },
    { label: 'Chainalysis risk', value: 'Low', meta: 'weighted avg · 240 addrs', variant: 'ok' },
    { label: 'Suspicious', value: '1 flag', meta: 'usr_1m5 · under review', variant: 'warn' },
    { label: 'KYC expiring', value: '3 users', meta: 'auto-renewal notices sent', variant: 'warn' },
  ];
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

  // Show critical/warning unread first, fall back to most recent 5
  const critical = notifs
    .filter((n) => (n.severity === 'critical' || n.severity === 'warning') && !n.readAt)
    .slice(0, 5);
  const displayed = critical.length > 0 ? critical : notifs.slice(0, 5);

  if (displayed.length === 0) {
    return (
      <div className="alert-list">
        <div className="alert-compact alert-info">
          <div className="alert-compact-head">
            <I.Check size={11} />
            <span className="alert-compact-title">No active alerts</span>
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
