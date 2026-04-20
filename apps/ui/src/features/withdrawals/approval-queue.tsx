// Approval queue — renders multisig signer rows with progress bar.
// Used inside WithdrawalSheet and can be reused on the Multisig page.
import { I } from '@/icons';
import { type FixWithdrawal, TREASURERS } from '../_shared/fixtures-flows';
import { shortAddr } from '../_shared/helpers';
import { LiveTimeAgo } from '../_shared/realtime';

interface Props {
  multisig: FixWithdrawal['multisig'];
  stage: FixWithdrawal['stage'];
  chain: 'bnb' | 'sol';
  currentStaffId?: string | null;
}

export function ApprovalQueue({ multisig, stage, chain, currentStaffId }: Props) {
  const approverMap = new Map(multisig.approvers.map((a) => [a.staffId, a]));
  const rejector = multisig.rejectedBy
    ? TREASURERS.find((s) => s.id === multisig.rejectedBy)
    : null;

  const barWidth = Math.min(100, (multisig.collected / multisig.required) * 100);
  const barBg =
    stage === 'failed'
      ? 'var(--err)'
      : multisig.collected >= multisig.required
        ? 'var(--ok)'
        : 'var(--accent)';

  return (
    <div className="approval-box" style={{ marginBottom: 20 }}>
      <div className="approval-box-title">
        <span>
          <I.Shield size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
          Multisig approvals
        </span>
        <span className="approval-count">
          {multisig.collected} of {multisig.required}
        </span>
      </div>
      <div className="approval-progress">
        <div className="approval-bar">
          <div className="approval-bar-fill" style={{ width: `${barWidth}%`, background: barBg }} />
        </div>
        <span className="text-xs text-muted">{multisig.total - multisig.collected} remaining</span>
      </div>

      {rejector && (
        <div className="perm-blocked" style={{ marginBottom: 12 }}>
          <I.UserX size={13} />
          <div>
            <div className="fw-500" style={{ fontSize: 12 }}>
              Rejected by {rejector.name}
            </div>
            <div className="text-xs" style={{ marginTop: 2, opacity: 0.85 }}>
              No further signatures accepted on this request.
            </div>
          </div>
        </div>
      )}

      <div>
        {TREASURERS.map((t) => {
          const a = approverMap.get(t.id);
          const isMe = currentStaffId && currentStaffId === t.id;
          const addr = chain === 'sol' ? t.solAddr : t.evmAddr;
          return (
            <div key={t.id} className="signer-row">
              <div className="avatar">{t.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="signer-row-head">
                  <span className="signer-name">{t.name}</span>
                  {isMe && <span className="signer-you">you</span>}
                  <span className="signer-addr text-mono">
                    {addr ? shortAddr(addr, 5, 4) : 'unregistered'}
                  </span>
                </div>
                <div className="signer-row-sub">
                  {a ? (
                    <>
                      <span className="signer-dot signer-dot-ok" />
                      signed <LiveTimeAgo at={a.at} />
                      {a.txSig && (
                        <>
                          {' '}
                          ·{' '}
                          <span className="text-mono text-faint">
                            {a.txSig.slice(0, 14)}…{a.txSig.slice(-6)}
                          </span>
                        </>
                      )}
                    </>
                  ) : rejector ? (
                    <>
                      <span className="signer-dot signer-dot-faint" />
                      not required
                    </>
                  ) : (
                    <>
                      <span className="signer-dot signer-dot-pending" />
                      awaiting signature
                    </>
                  )}
                </div>
              </div>
              <span className="tr-status">
                {a ? (
                  <span className="approved-stamp">
                    <I.Check size={10} /> signed
                  </span>
                ) : rejector ? (
                  <span className="pending-stamp">—</span>
                ) : (
                  <span className="pending-stamp">
                    <I.Clock size={10} /> pending
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
