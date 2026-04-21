import {
  type DashboardHistoryMetric,
  type DashboardHistoryRange,
  useDashboardHistory,
  useDashboardMetrics,
} from '@/api/queries';
import { ChainPill, Segmented, TokenPill } from '@/components/custody';
import { fmtCompact, fmtUSD } from '@/lib/format';
// Dashboard chart + holdings — tabbed pro-card with AreaChart and asset rows.
// Time-series data from GET /dashboard/history — real DB buckets, no synthetic fallback.
import { useMemo, useState } from 'react';
import { AreaChart, Sparkline } from '../_shared/charts';

/** Build x-axis date labels for the given range, ending with "Today" */
function buildAxisLabels(range: DashboardHistoryRange): string[] {
  const days = range === '24h' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const labels: string[] = [];
  const now = new Date();
  // Pick a reasonable number of visible tick points (max 7)
  const ticks = Math.min(days, 7);
  const step = days / (ticks - 1);
  for (let i = 0; i < ticks - 1; i++) {
    const d = new Date(now.getTime() - (days - i * step) * 24 * 60 * 60 * 1000);
    if (range === '24h') {
      labels.push(d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }));
    } else {
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
  }
  labels.push('Today');
  return labels;
}

/**
 * Compute period delta: (latest - first) / first * 100.
 * Returns null if series is empty or first value is zero (avoids division by zero).
 */
function computeDelta(series: number[]): number | null {
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  if (first == null || last == null || first === 0) return null;
  return ((last - first) / first) * 100;
}

/** Format delta as "+12.3%" or "-5.1%". Returns "—" when null. */
function fmtDelta(delta: number | null): string {
  if (delta === null) return '—';
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

export function DashboardChart() {
  const [range, setRange] = useState<DashboardHistoryRange>('7d');
  const [metric, setMetric] = useState<DashboardHistoryMetric>('aum');

  const { data: metrics } = useDashboardMetrics();
  const { data: historyData } = useDashboardHistory(metric, range);

  const totalUsdt = Number(metrics?.aumUsdt ?? 0);
  const totalUsdc = Number(metrics?.aumUsdc ?? 0);
  const total = totalUsdt + totalUsdc;

  const pendingDepositsValue = Number(metrics?.pendingDepositsValue ?? 0);
  const pendingWithdrawals = metrics?.pendingWithdrawals ?? 0;

  // Extract numeric series from real history points
  const series = useMemo(() => (historyData?.points ?? []).map((p) => p.v), [historyData]);

  const stroke =
    metric === 'aum' ? 'var(--accent)' : metric === 'deposits' ? 'var(--ok)' : 'var(--info)';

  const axisLabels = useMemo(() => buildAxisLabels(range), [range]);

  // Compute real deltas from historical series
  const aumDelta = useMemo(() => {
    if (metric !== 'aum') return null;
    return computeDelta(series);
  }, [metric, series]);

  const depDelta = useMemo(() => {
    if (metric !== 'deposits') return null;
    return computeDelta(series);
  }, [metric, series]);

  const wdDelta = useMemo(() => {
    if (metric !== 'withdrawals') return null;
    return computeDelta(series);
  }, [metric, series]);

  const tabs = [
    {
      id: 'aum' as const,
      label: 'AUM',
      value: `$${fmtCompact(total)}`,
      delta: fmtDelta(aumDelta),
      positive: aumDelta === null || aumDelta >= 0,
    },
    {
      id: 'deposits' as const,
      label: 'Deposits (pending)',
      value: `$${fmtCompact(pendingDepositsValue)}`,
      delta: fmtDelta(depDelta),
      positive: depDelta === null || depDelta >= 0,
    },
    {
      id: 'withdrawals' as const,
      label: 'Withdrawals (pending)',
      value: String(pendingWithdrawals),
      delta: fmtDelta(wdDelta),
      positive: wdDelta === null || wdDelta >= 0,
    },
  ];

  // Empty state: no data yet for this metric/range
  const isEmpty = series.length === 0;

  return (
    <div className="card pro-card">
      <div className="pro-card-header">
        <div className="pro-card-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`pro-tab ${metric === tab.id ? 'active' : ''}`}
              onClick={() => setMetric(tab.id)}
            >
              <span className="pro-tab-label">{tab.label}</span>
              <span className="pro-tab-value">{tab.value}</span>
              <span className={`pro-tab-delta ${tab.positive ? 'up' : 'down'}`}>{tab.delta}</span>
            </button>
          ))}
        </div>
        <div className="spacer" />
        <Segmented
          options={[
            { value: '24h', label: '24h' },
            { value: '7d', label: '7d' },
            { value: '30d', label: '30d' },
            { value: '90d', label: '90d' },
          ]}
          value={range}
          onChange={setRange}
        />
      </div>
      <div className="pro-card-body">
        {isEmpty ? (
          <div
            className="chart-empty-state"
            style={{
              height: 180,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="text-sm text-muted">
              No historical data yet — activity will appear here
            </span>
          </div>
        ) : (
          <AreaChart data={series} height={180} stroke={stroke} label={metric} />
        )}
        <div className="chart-axis">
          {axisLabels.map((lbl) => (
            <span key={lbl}>{lbl}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HoldingsList() {
  const { data: metrics } = useDashboardMetrics();

  const aumUsdt = Number(metrics?.aumUsdt ?? 0);
  const aumUsdc = Number(metrics?.aumUsdc ?? 0);
  const total = aumUsdt + aumUsdc;

  const usdtPct = total > 0 ? Math.round((aumUsdt / total) * 100) : 0;
  const usdcPct = total > 0 ? Math.round((aumUsdc / total) * 100) : 0;

  const rows = [
    {
      token: 'USDT' as const,
      chain: 'bnb' as const,
      bal: aumUsdt,
      pct: usdtPct,
      delta: '—',
      // Empty sparkline — no synthetic data; will stay blank until history endpoint
      // is wired per-token (future: useDashboardHistory('aum', '7d') filtered by currency)
      series: [] as number[],
      color: 'oklch(70% 0.12 165)',
    },
    {
      token: 'USDC' as const,
      chain: 'sol' as const,
      bal: aumUsdc,
      pct: usdcPct,
      delta: '—',
      series: [] as number[],
      color: 'oklch(65% 0.14 245)',
    },
  ];

  return (
    <div className="card pro-card">
      <div className="pro-card-header">
        <h3 className="card-title">Holdings</h3>
        <span className="text-xs text-muted text-mono">Assets · % of AUM</span>
      </div>
      <div className="holdings-list">
        {rows.map((r, i) => (
          <div key={i} className="holdings-row">
            <div className="holdings-cell-asset">
              <TokenPill token={r.token} />
              <ChainPill chain={r.chain} />
            </div>
            <div className="holdings-cell-val">
              <div className="text-mono fw-600">${fmtUSD(r.bal)}</div>
              <div className="text-xs text-muted">{r.pct}% of AUM</div>
            </div>
            {r.series.length >= 2 ? (
              <Sparkline data={r.series} width={60} height={20} stroke={r.color} />
            ) : (
              <span style={{ width: 60, height: 20, display: 'inline-block' }} />
            )}
            <span className="text-xs text-mono fw-500">{r.delta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
