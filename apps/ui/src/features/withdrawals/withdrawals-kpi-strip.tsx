// Withdrawals KPI strip — 4 mini cards.
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
    <div className="kpi-strip">
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Clock size={10} />
          Awaiting signatures
        </div>
        <div className="kpi-mini-value">
          ${fmtCompact(awaiting.reduce((s, w) => s + w.amount, 0))}
        </div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">{awaiting.length} requests</span>
          <span className="badge-tight warn">
            <span className="dot" />
            pending
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Check size={10} />
          Completed · 7d
        </div>
        <div className="kpi-mini-value">
          ${fmtCompact(completed.reduce((s, w) => s + w.amount, 0))}
        </div>
        <div className="kpi-mini-foot">
          <span className="text-xs delta-up">+8.4%</span>
          <span className="text-xs text-muted text-mono">{completed.length} sent</span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Lightning size={10} />
          Avg turnaround
        </div>
        <div className="kpi-mini-value">1h 04m</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted">target &lt; 2h</span>
          <span className="badge-tight ok">
            <span className="dot" />
            SLA
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.UserX size={10} />
          Failed / rejected
        </div>
        <div className="kpi-mini-value">{failed.length}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted">last 30d</span>
          <span className="badge-tight err">
            <span className="dot" />
            review
          </span>
        </div>
      </div>
    </div>
  );
}
