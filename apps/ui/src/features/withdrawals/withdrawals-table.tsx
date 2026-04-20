import { Address, ChainPill, Risk, StatusBadge, TokenPill } from '@/components/custody';
// Withdrawals table — prototype visual port with approval pips.
import { I } from '@/icons';
import { fmtUSD } from '@/lib/format';
import { useTweaksStore } from '@/stores/tweaks-store';
import { type FixWithdrawal, TREASURERS } from '../_shared/fixtures-flows';
import { LiveTimeAgo } from '../_shared/realtime';

interface Props {
  rows: FixWithdrawal[];
  onSelect: (w: FixWithdrawal) => void;
}

export function WithdrawalsTable({ rows, onSelect }: Props) {
  const showRiskFlags = useTweaksStore((s) => s.showRiskFlags);

  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>ID</th>
          <th>Asset</th>
          <th>Chain</th>
          <th className="num">Amount</th>
          <th>Destination</th>
          <th>Approvals</th>
          <th>Status</th>
          {showRiskFlags && <th>Risk</th>}
          <th>Requested by</th>
          <th className="num">Created</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={showRiskFlags ? 10 : 9}>
              <div className="table-empty">
                <div className="table-empty-title">No withdrawals</div>
                <div className="text-sm">New withdrawal requests appear here.</div>
              </div>
            </td>
          </tr>
        ) : (
          rows.map((w) => {
            const requester = TREASURERS.find((s) => s.id === w.requestedBy);
            return (
              <tr key={w.id} onClick={() => onSelect(w)} style={{ cursor: 'pointer' }}>
                <td className="text-mono fw-500">{w.id}</td>
                <td>
                  <TokenPill token={w.token} />
                </td>
                <td>
                  <ChainPill chain={w.chain} />
                </td>
                <td className="num text-mono fw-500">{fmtUSD(w.amount)}</td>
                <td>
                  <Address value={w.destination} chain={w.chain} />
                </td>
                <td>
                  <div className="approval-row">
                    {Array.from({ length: w.multisig.total }, (_, j) => (
                      <div
                        key={j}
                        className={`approval-pip ${j < w.multisig.collected ? 'approved' : 'pending'}`}
                      >
                        {j < w.multisig.collected ? <I.Check size={9} /> : ''}
                      </div>
                    ))}
                    <span className="approval-text">
                      {w.multisig.collected}/{w.multisig.required}
                    </span>
                  </div>
                </td>
                <td>
                  <StatusBadge status={w.stage} />
                </td>
                {showRiskFlags && (
                  <td>
                    <Risk level={w.risk} />
                  </td>
                )}
                <td className="text-sm">{requester?.name || '—'}</td>
                <td className="num text-xs text-muted">
                  <LiveTimeAgo at={w.createdAt} />
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
