import { useDashboardMetrics } from '@/api/queries';
import { ChainPill, Segmented, TokenPill } from '@/components/custody';
import { fmtCompact, fmtUSD } from '@/lib/format';
// Dashboard chart + holdings — tabbed pro-card with AreaChart and asset rows.
// Real AUM total from /dashboard/metrics. Time-series sparklines are cosmetic
// (no historical OHLC endpoint yet — noted for future charting slice).
import { useMemo, useState } from 'react';
import { AreaChart, Sparkline, makeSeries } from '../_shared/charts';

type Range = '24h' | '7d' | '30d' | '90d';
type Metric = 'aum' | 'deposits' | 'withdrawals';

export function DashboardChart() {
  const [range, setRange] = useState<Range>('7d');
  const [metric, setMetric] = useState<Metric>('aum');

  const { data: metrics } = useDashboardMetrics();

  const totalUsdt = Number(metrics?.aumUsdt ?? 0);
  const totalUsdc = Number(metrics?.aumUsdc ?? 0);
  const total = totalUsdt + totalUsdc;

  const pendingDepositsValue = Number(metrics?.pendingDepositsValue ?? 0);
  const pendingWithdrawals = metrics?.pendingWithdrawals ?? 0;

  // Cosmetic trend series — scaled to real totals so proportions are meaningful
  const aumSeries = useMemo(
    () => makeSeries(42, 60, 0.12, 0.035).map((v) => v * Math.max(total, 1) * 0.92),
    [total]
  );
  const depSeries = useMemo(
    () => makeSeries(101, 48, 0.04, 0.1).map((v) => v * Math.max(pendingDepositsValue, 80_000)),
    [pendingDepositsValue]
  );
  const wdSeries = useMemo(
    () =>
      makeSeries(207, 48, 0.02, 0.09).map((v) => v * Math.max(pendingWithdrawals * 5000, 50_000)),
    [pendingWithdrawals]
  );

  const series = metric === 'aum' ? aumSeries : metric === 'deposits' ? depSeries : wdSeries;
  const stroke =
    metric === 'aum' ? 'var(--accent)' : metric === 'deposits' ? 'var(--ok)' : 'var(--info)';

  const tabs = [
    {
      id: 'aum' as const,
      label: 'AUM',
      value: `$${fmtCompact(total)}`,
      delta: '—',
      positive: true,
    },
    {
      id: 'deposits' as const,
      label: 'Deposits (pending)',
      value: `$${fmtCompact(pendingDepositsValue)}`,
      delta: '—',
      positive: true,
    },
    {
      id: 'withdrawals' as const,
      label: 'Withdrawals (pending)',
      value: String(pendingWithdrawals),
      delta: '—',
      positive: false,
    },
  ];

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
        <AreaChart data={series} height={180} stroke={stroke} label={metric} />
        <div className="chart-axis">
          <span>Apr 15</span>
          <span>Apr 16</span>
          <span>Apr 17</span>
          <span>Apr 18</span>
          <span>Apr 19</span>
          <span>Apr 20</span>
          <span>Today</span>
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

  const usdtSpark = useMemo(() => makeSeries(401, 32, 0.04, 0.02), []);
  const usdcSpark = useMemo(() => makeSeries(402, 32, 0.06, 0.025), []);

  const usdtPct = total > 0 ? Math.round((aumUsdt / total) * 100) : 0;
  const usdcPct = total > 0 ? Math.round((aumUsdc / total) * 100) : 0;

  const rows = [
    {
      token: 'USDT' as const,
      chain: 'bnb' as const,
      bal: aumUsdt,
      pct: usdtPct,
      delta: '—',
      series: usdtSpark,
      color: 'oklch(70% 0.12 165)',
    },
    {
      token: 'USDC' as const,
      chain: 'sol' as const,
      bal: aumUsdc,
      pct: usdcPct,
      delta: '—',
      series: usdcSpark,
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
            <Sparkline data={r.series} width={60} height={20} stroke={r.color} />
            <span className="text-xs text-mono fw-500">{r.delta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
