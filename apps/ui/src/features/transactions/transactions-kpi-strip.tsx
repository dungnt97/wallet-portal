// Transactions KPI strip — volume / deposits / withdrawals / gas.
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';
import { useMemo } from 'react';
import { Sparkline, makeSeries } from '../_shared/charts';
import type { FixTransaction } from './transactions-fixtures';

interface Props {
  rows: FixTransaction[];
}

export function TransactionsKpiStrip({ rows }: Props) {
  const totalVol = rows.reduce((s, t) => s + t.amount, 0);
  const totalFee = rows.reduce((s, t) => s + t.fee, 0);
  const volSeries = useMemo(() => makeSeries(81, 48, 0.03, 0.08).map((v) => v * 40_000), []);
  const deposits = rows.filter((t) => t.type === 'deposit');
  const withdrawals = rows.filter((t) => t.type === 'withdrawal');

  return (
    <div className="kpi-strip">
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Activity size={10} />
          Total volume
        </div>
        <div className="kpi-mini-value">${fmtCompact(totalVol)}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">{rows.length} tx</span>
          <Sparkline data={volSeries.slice(-24)} width={56} height={14} stroke="var(--accent)" />
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.ArrowDown size={10} />
          Deposits
        </div>
        <div className="kpi-mini-value">{deposits.length}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">
            ${fmtCompact(deposits.reduce((s, t) => s + t.amount, 0))}
          </span>
          <span className="badge-tight ok">
            <span className="dot" />
            Inbound
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.ArrowUp size={10} />
          Withdrawals
        </div>
        <div className="kpi-mini-value">{withdrawals.length}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">
            ${fmtCompact(withdrawals.reduce((s, t) => s + t.amount, 0))}
          </span>
          <span className="badge-tight info">
            <span className="dot" />
            Outbound
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Lightning size={10} />
          Gas spent
        </div>
        <div className="kpi-mini-value">{totalFee.toFixed(3)}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">BNB + SOL</span>
          <span className="text-xs text-muted">all chains</span>
        </div>
      </div>
    </div>
  );
}
