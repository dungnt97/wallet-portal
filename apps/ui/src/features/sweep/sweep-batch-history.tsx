// Sweep batch history table — recent batches row list.
import { ChainPill, StatusBadge } from '@/components/custody';
import { fmtUSD } from '@/lib/format';
import { LiveTimeAgo } from '../_shared/realtime';

export interface Batch {
  id: string;
  chain: 'bnb' | 'sol';
  addresses: number;
  total: number;
  fee: number;
  status: 'completed' | 'partial';
  createdAt: string;
  executedAt: string;
}

interface Props {
  batches: Batch[];
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
                <LiveTimeAgo at={b.executedAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
