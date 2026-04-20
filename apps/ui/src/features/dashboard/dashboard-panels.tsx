// Port of ~/Documents/portal/src/page_dashboard.jsx (sub-sections) — visual fidelity verified 2026-04-20.
// Dashboard panel components — System status / Gas wallets / SLA / Compliance / Alerts.
// Split from dashboard-page.tsx to keep each file under 200 LOC.
import { ChainPill } from '@/components/custody';
import { I } from '@/icons';
import { LiveDot, LiveTimeAgo, useRealtime } from '../_shared/realtime';

export function SystemStatusList() {
  const rt = useRealtime();
  const rows: { name: string; variant: 'ok' | 'warn' | 'err'; meta: string }[] = [
    {
      name: 'BNB RPC primary',
      variant: 'ok',
      meta: `${rt.rpc.bnb.ms}ms · block ${rt.blocks.bnb.toLocaleString()}`,
    },
    {
      name: 'BNB RPC backup',
      variant: 'ok',
      meta: `${rt.rpc.bnb.ms + 12}ms · lag ${rt.rpc.bnb.lagBlocks}`,
    },
    {
      name: 'Solana RPC',
      variant: 'ok',
      meta: `${rt.rpc.sol.ms}ms · slot ${rt.blocks.sol.toLocaleString()}`,
    },
    {
      name: 'Deposit watcher',
      variant: 'ok',
      meta: `lag ${rt.rpc.bnb.lagBlocks} blk · last tick 2s ago`,
    },
    { name: 'Sweep executor', variant: 'warn', meta: '3 jobs queued · 1 retry' },
    { name: 'Multisig tracker', variant: 'ok', meta: 'synced · last 18s ago' },
    { name: 'Postgres', variant: 'ok', meta: 'p95 12ms · 14/40 conn' },
    { name: 'Redis · queue', variant: 'ok', meta: '2 active · 0 dead' },
  ];
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
  const rt = useRealtime();
  const rows = [
    {
      chain: 'bnb' as const,
      name: 'Sweep ops · BSC',
      bal: 0.842,
      low: 0.5,
      price: `${rt.gasPrice.bnb} gwei`,
      unit: 'BNB',
    },
    {
      chain: 'bnb' as const,
      name: 'Withdrawals · BSC',
      bal: 2.14,
      low: 1.0,
      price: `${rt.gasPrice.bnb} gwei`,
      unit: 'BNB',
    },
    {
      chain: 'sol' as const,
      name: 'Sweep ops · Solana',
      bal: 4.22,
      low: 2.0,
      price: '5000 μLp',
      unit: 'SOL',
    },
    {
      chain: 'sol' as const,
      name: 'Withdrawals · SOL',
      bal: 0.188,
      low: 0.5,
      price: '5000 μLp',
      unit: 'SOL',
    },
  ];
  return (
    <div className="gas-list">
      {rows.map((g, i) => {
        const low = g.bal < g.low;
        const pct = Math.min(100, (g.bal / (g.low * 3)) * 100);
        return (
          <div key={i} className="gas-row">
            <ChainPill chain={g.chain} />
            <div className="gas-info">
              <div className="gas-name">{g.name}</div>
              <div className="gas-meta text-xs text-muted text-mono">
                {g.price} · min {g.low} {g.unit}
              </div>
            </div>
            <div className="gas-bal">
              <div className={`text-mono fw-600 ${low ? 'text-err' : ''}`}>
                {g.bal.toFixed(3)} <span className="text-xs text-muted">{g.unit}</span>
              </div>
              <div className="gas-bar">
                <div className={`gas-bar-fill ${low ? 'low' : ''}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        );
      })}
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

export function AlertsList() {
  const alerts = [
    {
      id: 'al1',
      severity: 'warn',
      title: 'BNB sweep threshold reached',
      text: '12 deposit addresses now exceed the 500 USDT sweep threshold.',
      when: new Date(Date.now() - 8 * 60_000).toISOString(),
    },
    {
      id: 'al2',
      severity: 'info',
      title: 'Multisig op_40003 awaiting 2 signatures',
      text: 'Withdrawal of 12,400 USDT to 0x71C2…fA09 expires in 5h 42m.',
      when: new Date(Date.now() - 22 * 60_000).toISOString(),
    },
    {
      id: 'al3',
      severity: 'err',
      title: 'Sweep batch b_8104 partially failed',
      text: '1 of 6 transactions reverted (insufficient gas). Retry available.',
      when: new Date(Date.now() - 96 * 60_000).toISOString(),
    },
  ];
  return (
    <div className="alert-list">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={`alert-compact alert-${a.severity === 'err' ? 'err' : a.severity === 'warn' ? 'warn' : 'info'}`}
        >
          <div className="alert-compact-head">
            <I.AlertTri size={11} />
            <span className="alert-compact-title">{a.title}</span>
            <span className="text-xs text-faint text-mono">
              <LiveTimeAgo at={a.when} />
            </span>
          </div>
          <div className="alert-compact-text">{a.text}</div>
        </div>
      ))}
    </div>
  );
}
