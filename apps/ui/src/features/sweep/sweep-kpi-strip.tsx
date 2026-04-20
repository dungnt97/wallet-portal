import { StatusBadge } from '@/components/custody';
// Sweep KPI strip — 4 mini cards.
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { fmtCompact } from '@/lib/format';
import { LiveTimeAgo } from '../_shared/realtime';

interface Batch {
  id: string;
  executedAt: string;
  status: 'completed' | 'partial';
}

interface Props {
  chain: 'bnb' | 'sol';
  readyTotal: number;
  readyCount: number;
  selectedCount: number;
  selectedTotal: number;
  estFee: number;
  latest: Batch | undefined;
}

export function SweepKpiStrip({
  chain,
  readyTotal,
  readyCount,
  selectedCount,
  selectedTotal,
  estFee,
  latest,
}: Props) {
  return (
    <div className="kpi-strip">
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Sweep size={10} />
          Ready to sweep
        </div>
        <div className="kpi-mini-value">${fmtCompact(readyTotal)}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">
            {readyCount} {CHAINS[chain].short} addrs
          </span>
          <span className="badge-tight warn">
            <span className="dot" />
            pending
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Check size={10} />
          Selected
        </div>
        <div className="kpi-mini-value">${fmtCompact(selectedTotal)}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">{selectedCount} addrs</span>
          <span className="text-xs delta-up">batch</span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Lightning size={10} />
          Est. network fee
        </div>
        <div className="kpi-mini-value">{estFee.toFixed(chain === 'bnb' ? 4 : 6)}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">{chain === 'bnb' ? 'BNB' : 'SOL'}</span>
          <span className="text-xs text-muted">per batch</span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Activity size={10} />
          Last sweep
        </div>
        <div className="kpi-mini-value" style={{ fontSize: 16 }}>
          {latest ? <LiveTimeAgo at={latest.executedAt} /> : '—'}
        </div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">{latest?.id}</span>
          {latest && <StatusBadge status={latest.status === 'partial' ? 'failed' : 'completed'} />}
        </div>
      </div>
    </div>
  );
}
