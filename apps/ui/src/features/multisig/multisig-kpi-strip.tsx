// Multisig KPI strip — 4 mini cards.
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
    <div className="kpi-strip">
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Clock size={10} />
          Collecting
        </div>
        <div className="kpi-mini-value">{collecting.length}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">
            ${fmtCompact(collecting.reduce((s, o) => s + o.amount, 0))}
          </span>
          <span className="badge-tight warn">
            <span className="dot" />
            signing
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Check size={10} />
          Ready to execute
        </div>
        <div className="kpi-mini-value">{ready.length}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">threshold met</span>
          <span className="badge-tight ok">
            <span className="dot" />
            ready
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Users size={10} />
          Treasurers
        </div>
        <div className="kpi-mini-value">{TREASURERS.length}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted">all active</span>
          <span className="badge-tight ok">
            <span className="dot" />
            online
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.UserX size={10} />
          Rejected · 30d
        </div>
        <div className="kpi-mini-value">{failedCount}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted">
            {failedCount === 0 ? 'no rejections' : 'review required'}
          </span>
        </div>
      </div>
    </div>
  );
}
