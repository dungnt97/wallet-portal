import { ChainPill, Segmented, TokenPill } from '@/components/custody';
import { fmtCompact, fmtUSD } from '@/lib/format';
// Dashboard chart + holdings — tabbed pro-card with AreaChart and asset rows.
import { useMemo, useState } from 'react';
import { AreaChart, Sparkline, makeSeries } from '../_shared/charts';
import { FIX_DEPOSITS, TOTAL_BALANCES } from '../_shared/fixtures';
import { FIX_WITHDRAWALS } from '../_shared/fixtures';

type Range = '24h' | '7d' | '30d' | '90d';
type Metric = 'aum' | 'deposits' | 'withdrawals';

export function DashboardChart() {
  const [range, setRange] = useState<Range>('7d');
  const [metric, setMetric] = useState<Metric>('aum');

  const totalBnb = TOTAL_BALANCES.bnb.USDT + TOTAL_BALANCES.bnb.USDC;
  const total = totalBnb + TOTAL_BALANCES.sol.USDT + TOTAL_BALANCES.sol.USDC;

  const aumSeries = useMemo(
    () => makeSeries(42, 60, 0.12, 0.035).map((v) => v * total * 0.92),
    [total]
  );
  const depSeries = useMemo(() => makeSeries(101, 48, 0.04, 0.1).map((v) => v * 80_000), []);
  const wdSeries = useMemo(() => makeSeries(207, 48, 0.02, 0.09).map((v) => v * 50_000), []);

  const series = metric === 'aum' ? aumSeries : metric === 'deposits' ? depSeries : wdSeries;
  const stroke =
    metric === 'aum' ? 'var(--accent)' : metric === 'deposits' ? 'var(--ok)' : 'var(--info)';

  const tabs = [
    {
      id: 'aum' as const,
      label: 'AUM',
      value: `$${fmtCompact(total)}`,
      delta: '+2.4%',
      positive: true,
    },
    {
      id: 'deposits' as const,
      label: 'Deposits',
      value: `$${fmtCompact(FIX_DEPOSITS.reduce((s, d) => s + d.amount, 0))}`,
      delta: '+12.1%',
      positive: true,
    },
    {
      id: 'withdrawals' as const,
      label: 'Withdrawals',
      value: `$${fmtCompact(FIX_WITHDRAWALS.reduce((s, w) => s + w.amount, 0))}`,
      delta: '-3.8%',
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
          <span>Apr 12</span>
          <span>Apr 13</span>
          <span>Apr 14</span>
          <span>Apr 15</span>
          <span>Apr 16</span>
          <span>Apr 17</span>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}

export function HoldingsList() {
  const usdtSpark = useMemo(() => makeSeries(401, 32, 0.04, 0.02), []);
  const usdcSpark = useMemo(() => makeSeries(402, 32, 0.06, 0.025), []);
  const solUsdtSpark = useMemo(() => makeSeries(501, 24, 0, 0.03), []);
  const solUsdcSpark = useMemo(() => makeSeries(502, 24, 0.03, 0.025), []);

  const rows = [
    {
      token: 'USDT' as const,
      chain: 'bnb' as const,
      bal: TOTAL_BALANCES.bnb.USDT,
      pct: 35,
      delta: '+1.8%',
      series: usdtSpark,
      color: 'oklch(70% 0.12 165)',
    },
    {
      token: 'USDC' as const,
      chain: 'bnb' as const,
      bal: TOTAL_BALANCES.bnb.USDC,
      pct: 21,
      delta: '+3.1%',
      series: usdcSpark,
      color: 'oklch(65% 0.14 245)',
    },
    {
      token: 'USDT' as const,
      chain: 'sol' as const,
      bal: TOTAL_BALANCES.sol.USDT,
      pct: 26,
      delta: '-0.4%',
      series: solUsdtSpark,
      color: 'oklch(70% 0.12 165)',
    },
    {
      token: 'USDC' as const,
      chain: 'sol' as const,
      bal: TOTAL_BALANCES.sol.USDC,
      pct: 18,
      delta: '+2.7%',
      series: solUsdcSpark,
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
            <span
              className={`text-xs text-mono fw-500 ${r.delta.startsWith('-') ? 'delta-down' : 'delta-up'}`}
            >
              {r.delta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
