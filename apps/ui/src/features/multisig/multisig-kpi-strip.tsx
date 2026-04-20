// Multisig KPI strip — thin wrapper around the shared `<KpiStrip>` primitive.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';
import { type FIX_MULTISIG_OPS, TREASURERS } from '../_shared/fixtures-flows';

type Op = (typeof FIX_MULTISIG_OPS)[number];

interface Props {
  ops: Op[];
  failedCount: number;
}

export function MultisigKpiStrip({ ops, failedCount }: Props) {
  const collecting = ops.filter((o) => o.status === 'collecting');
  const ready = ops.filter((o) => o.status === 'ready');

  return (
    <KpiStrip
      items={[
        {
          key: 'collecting',
          label: (
            <>
              <I.Clock size={10} />
              Collecting
            </>
          ),
          value: collecting.length,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                ${fmtCompact(collecting.reduce((s, o) => s + o.amount, 0))}
              </span>
              <span className="badge-tight warn">
                <span className="dot" />
                signing
              </span>
            </>
          ),
        },
        {
          key: 'ready',
          label: (
            <>
              <I.Check size={10} />
              Ready to execute
            </>
          ),
          value: ready.length,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">threshold met</span>
              <span className="badge-tight ok">
                <span className="dot" />
                ready
              </span>
            </>
          ),
        },
        {
          key: 'treasurers',
          label: (
            <>
              <I.Users size={10} />
              Treasurers
            </>
          ),
          value: TREASURERS.length,
          foot: (
            <>
              <span className="text-xs text-muted">all active</span>
              <span className="badge-tight ok">
                <span className="dot" />
                online
              </span>
            </>
          ),
        },
        {
          key: 'rejected',
          label: (
            <>
              <I.UserX size={10} />
              Rejected · 30d
            </>
          ),
          value: failedCount,
          foot: (
            <span className="text-xs text-muted">
              {failedCount === 0 ? 'no rejections' : 'review required'}
            </span>
          ),
        },
      ]}
    />
  );
}
