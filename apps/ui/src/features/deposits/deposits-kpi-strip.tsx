import { ChainPill } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';
// Deposits KPI strip — 4 mini cards above the table.
import { useMemo } from 'react';
import { Sparkline, makeSeries } from '../_shared/charts';
import type { FixDeposit } from '../_shared/fixtures';
import { LiveTimeAgo } from '../_shared/realtime';

interface Props {
  deposits: FixDeposit[];
}

export function DepositsKpiStrip({ deposits }: Props) {
  const pending = deposits.filter((d) => d.status === 'pending');
  const pendingVal = pending.reduce((s, d) => s + d.amount, 0);
  const credited24h = deposits
    .filter((d) => d.status !== 'pending')
    .reduce((s, d) => s + d.amount, 0);
  const last = deposits[0];

  const volSeries = useMemo(() => makeSeries(71, 48, 0.04, 0.1).map((v) => v * 8_000), []);
  const countSeries = useMemo(() => makeSeries(72, 48, 0.02, 0.12), []);

  return (
    <div className="kpi-strip">
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Clock size={10} />
          Pending value
        </div>
        <div className="kpi-mini-value">${fmtCompact(pendingVal)}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">{pending.length} txs</span>
          <Sparkline data={countSeries} width={56} height={14} stroke="var(--warn)" />
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Check size={10} />
          Credited · 24h
        </div>
        <div className="kpi-mini-value">${fmtCompact(credited24h)}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs delta-up">+12.1%</span>
          <Sparkline data={volSeries.slice(-24)} width={56} height={14} stroke="var(--ok)" />
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Lightning size={10} />
          Avg confirm time
        </div>
        <div className="kpi-mini-value">38s</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted">target &lt; 60s</span>
          <span className="badge-tight ok">
            <span className="dot" />
            SLA
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Database size={10} />
          Last detected
        </div>
        <div className="kpi-mini-value" style={{ fontSize: 16 }}>
          {last ? <LiveTimeAgo at={last.detectedAt} /> : '—'}
        </div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">{last?.userName}</span>
          {last && <ChainPill chain={last.chain} label={false} />}
        </div>
      </div>
    </div>
  );
}
