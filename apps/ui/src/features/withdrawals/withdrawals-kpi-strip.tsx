// Withdrawals KPI strip — derived from real WithdrawalRow list.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';
import type { WithdrawalRow } from './withdrawal-types';

interface Props {
  list: WithdrawalRow[];
}

export function WithdrawalsKpiStrip({ list }: Props) {
  const awaiting = list.filter((w) => w.stage === 'awaiting_signatures');
  const completed = list.filter((w) => w.stage === 'completed');
  const failed = list.filter((w) => w.stage === 'failed' || w.stage === 'cancelled');

  return (
    <KpiStrip
      items={[
        {
          key: 'awaiting',
          label: (
            <>
              <I.Clock size={10} />
              Awaiting signatures
            </>
          ),
          value: `$${fmtCompact(awaiting.reduce((s, w) => s + w.amount, 0))}`,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">{awaiting.length} requests</span>
              <span className="badge-tight warn">
                <span className="dot" />
                pending
              </span>
            </>
          ),
        },
        {
          key: 'completed',
          label: (
            <>
              <I.Check size={10} />
              Completed
            </>
          ),
          value: `$${fmtCompact(completed.reduce((s, w) => s + w.amount, 0))}`,
          foot: <span className="text-xs text-muted text-mono">{completed.length} sent</span>,
        },
        {
          key: 'turnaround',
          label: (
            <>
              <I.Lightning size={10} />
              Avg turnaround
            </>
          ),
          value: '—',
          foot: <span className="text-xs text-muted">target &lt; 2h</span>,
        },
        {
          key: 'failed',
          label: (
            <>
              <I.UserX size={10} />
              Failed / cancelled
            </>
          ),
          value: failed.length,
          foot: (
            <span className="badge-tight err">
              <span className="dot" />
              review
            </span>
          ),
        },
      ]}
    />
  );
}
