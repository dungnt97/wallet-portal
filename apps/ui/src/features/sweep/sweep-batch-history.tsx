// Sweep batch history table — uses SweepBatchRow from real /sweeps/batches API.
// Local Batch type removed; INITIAL_SWEEP_BATCHES fixture no longer used here.
import type { SweepBatchRow } from '@/api/queries';
import { ChainPill, StatusBadge } from '@/components/custody';
import { fmtUSD } from '@/lib/format';
import { LiveTimeAgo } from '../_shared/realtime';

/** Re-export so sweep-page can type the state without importing from queries */
export type Batch = SweepBatchRow;

interface Props {
  batches: SweepBatchRow[];
}

export function SweepBatchHistory({ batches }: Props) {
  return (
    <div className="card pro-card" style={{ marginTop: 14 }}>
      <div className="pro-card-header">
        <h3 className="card-title">Recent batches</h3>
        <span className="text-xs text-muted">last 10 sweeps</span>
        <div className="spacer" />
        <span className="text-xs text-muted text-mono">{batches.length} total</span>
      </div>
      <table className="table table-tight">
        <thead>
          <tr>
            <th>Batch ID</th>
            <th>Chain</th>
            <th className="num">Addresses</th>
            <th className="num">Total swept</th>
            <th className="num">Fee</th>
            <th>Status</th>
            <th className="num">Created</th>
            <th className="num">Executed</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id}>
              <td className="text-mono fw-500">{b.id}</td>
              <td>
                <ChainPill chain={b.chain} />
              </td>
              <td className="num text-mono">{b.addresses}</td>
              <td className="num text-mono fw-500">${fmtUSD(b.total)}</td>
              <td className="num text-mono text-xs text-muted">
                {b.fee.toFixed(b.chain === 'bnb' ? 4 : 6)} {b.chain === 'bnb' ? 'BNB' : 'SOL'}
              </td>
              <td>
                {b.status === 'partial' ? (
                  <span className="badge-tight err">
                    <span className="dot" />
                    partial
                  </span>
                ) : (
                  <StatusBadge status="completed" />
                )}
              </td>
              <td className="num text-xs text-muted">
                <LiveTimeAgo at={b.createdAt} />
              </td>
              <td className="num text-xs text-muted">
                {b.executedAt ? (
                  <LiveTimeAgo at={b.executedAt} />
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
