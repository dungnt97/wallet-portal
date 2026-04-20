// Withdrawals KPI strip — thin wrapper around the shared `<KpiStrip>` primitive.
// Data shaping lives here; presentation lives in `components/custody/kpi-strip.tsx`.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';
import type { FixWithdrawal } from '../_shared/fixtures-flows';

interface Props {
  list: FixWithdrawal[];
}

export function WithdrawalsKpiStrip({ list }: Props) {
  const awaiting = list.filter((w) => w.stage === 'awaiting_signatures');
  const completed = list.filter((w) => w.stage === 'completed');
  const failed = list.filter((w) => w.stage === 'failed');

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
              Completed · 7d
            </>
          ),
          value: `$${fmtCompact(completed.reduce((s, w) => s + w.amount, 0))}`,
          foot: (
            <>
              <span className="text-xs delta-up">+8.4%</span>
              <span className="text-xs text-muted text-mono">{completed.length} sent</span>
            </>
          ),
        },
        {
          key: 'turnaround',
          label: (
            <>
              <I.Lightning size={10} />
              Avg turnaround
            </>
          ),
          value: '1h 04m',
          foot: (
            <>
              <span className="text-xs text-muted">target &lt; 2h</span>
              <span className="badge-tight ok">
                <span className="dot" />
                SLA
              </span>
            </>
          ),
        },
        {
          key: 'failed',
          label: (
            <>
              <I.UserX size={10} />
              Failed / rejected
            </>
          ),
          value: failed.length,
          foot: (
            <>
              <span className="text-xs text-muted">last 30d</span>
              <span className="badge-tight err">
                <span className="dot" />
                review
              </span>
            </>
          ),
        },
      ]}
    />
  );
}
