// Deposits table — prototype visual port. Accepts either real API Deposit[] or
// the fixture FixDeposit[] shape; mapped internally to a single row type.
import { Address, ChainPill, Hash, Risk, StatusBadge, TokenPill } from '@/components/custody';
import { fmtUSD } from '@/lib/format';
import { useTweaksStore } from '@/stores/tweaks-store';
import type { FixDeposit } from '../_shared/fixtures';
import { LiveTimeAgo } from '../_shared/realtime';

interface Props {
  rows: FixDeposit[];
  onSelect: (d: FixDeposit) => void;
}

export function DepositsTable({ rows, onSelect }: Props) {
  const showRiskFlags = useTweaksStore((s) => s.showRiskFlags);

  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>User</th>
          <th>Chain</th>
          <th>Asset</th>
          <th className="num">Amount</th>
          <th>To address</th>
          <th>Tx hash</th>
          <th>Confs</th>
          <th>Status</th>
          {showRiskFlags && <th>Risk</th>}
          <th className="num">Detected</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={showRiskFlags ? 10 : 9}>
              <div className="table-empty">
                <div className="table-empty-title">No deposits</div>
                <div className="text-sm">Try adjusting your filters.</div>
              </div>
            </td>
          </tr>
        ) : (
          rows.map((d) => (
            <tr key={d.id} onClick={() => onSelect(d)} style={{ cursor: 'pointer' }}>
              <td>
                <div className="hstack">
                  <div className="avatar" style={{ width: 20, height: 20, fontSize: 9 }}>
                    {d.userName
                      .split(' ')
                      .map((s) => s[0])
                      .join('')}
                  </div>
                  <div>
                    <div className="fw-500">{d.userName}</div>
                    <div className="text-xs text-faint text-mono">{d.userId}</div>
                  </div>
                </div>
              </td>
              <td>
                <ChainPill chain={d.chain} />
              </td>
              <td>
                <TokenPill token={d.token} />
              </td>
              <td className="num text-mono fw-500">{fmtUSD(d.amount)}</td>
              <td>
                <Address value={d.address} chain={d.chain} />
              </td>
              <td>
                <Hash value={d.txHash} />
              </td>
              <td>
                {d.status === 'pending' ? (
                  <div className="hstack gap-xs">
                    <div className="progress" style={{ width: 52 }}>
                      <div
                        className="progress-bar"
                        style={{
                          width: `${(d.confirmations / d.requiredConfirmations) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-mono text-muted">
                      {d.confirmations}/{d.requiredConfirmations}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted text-mono">
                    {d.requiredConfirmations}/{d.requiredConfirmations}
                  </span>
                )}
              </td>
              <td>
                <StatusBadge status={d.status} />
              </td>
              {showRiskFlags && (
                <td>
                  <Risk level={d.risk} />
                </td>
              )}
              <td className="num text-xs text-muted">
                <LiveTimeAgo at={d.detectedAt} />
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
