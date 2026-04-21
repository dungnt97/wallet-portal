import { type TxRow, useDashboardHistory } from '@/api/queries';
// Transactions KPI strip — computed from real TxRow[] returned by useTransactions().
// FixTransaction removed.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';
import { useMemo } from 'react';
import { Sparkline } from '../_shared/charts';

interface Props {
  rows: TxRow[];
}

export function TransactionsKpiStrip({ rows }: Props) {
  const totalVol = rows.reduce((s, t) => s + t.amount, 0);
  const totalFee = rows.reduce((s, t) => s + t.fee, 0);
  // Real volume history from /dashboard/history — uses deposits metric as tx volume proxy
  const { data: volHistory } = useDashboardHistory('deposits', '7d');
  const volSeries = useMemo(
    () => (volHistory?.points ?? []).map((p) => p.v).slice(-24),
    [volHistory]
  );
  const deposits = rows.filter((t) => t.type === 'deposit');
  const withdrawals = rows.filter((t) => t.type === 'withdrawal');

  return (
    <KpiStrip
      items={[
        {
          key: 'volume',
          label: (
            <>
              <I.Activity size={10} />
              Total volume
            </>
          ),
          value: `$${fmtCompact(totalVol)}`,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">{rows.length} tx</span>
              <Sparkline data={volSeries} width={56} height={14} stroke="var(--accent)" />
            </>
          ),
        },
        {
          key: 'deposits',
          label: (
            <>
              <I.ArrowDown size={10} />
              Deposits
            </>
          ),
          value: deposits.length,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                ${fmtCompact(deposits.reduce((s, t) => s + t.amount, 0))}
              </span>
              <span className="badge-tight ok">
                <span className="dot" />
                Inbound
              </span>
            </>
          ),
        },
        {
          key: 'withdrawals',
          label: (
            <>
              <I.ArrowUp size={10} />
              Withdrawals
            </>
          ),
          value: withdrawals.length,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                ${fmtCompact(withdrawals.reduce((s, t) => s + t.amount, 0))}
              </span>
              <span className="badge-tight info">
                <span className="dot" />
                Outbound
              </span>
            </>
          ),
        },
        {
          key: 'gas',
          label: (
            <>
              <I.Lightning size={10} />
              Gas spent
            </>
          ),
          value: totalFee > 0 ? totalFee.toFixed(3) : '—',
          foot: (
            <>
              <span className="text-xs text-muted text-mono">BNB + SOL</span>
              <span className="text-xs text-muted">all chains</span>
            </>
          ),
        },
      ]}
    />
  );
}
