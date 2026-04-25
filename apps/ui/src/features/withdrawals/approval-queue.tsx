// Approval queue — renders multisig signer rows with progress bar.
// Uses real WithdrawalMultisig shape; no fixture imports.
import { I } from '@/icons';
import { useTranslation } from 'react-i18next';
import { shortAddr } from '../_shared/helpers';
import { LiveTimeAgo } from '../_shared/realtime';
import type { WithdrawalMultisig } from './withdrawal-types';

interface Props {
  multisig: WithdrawalMultisig;
  stage: string;
  chain: 'bnb' | 'sol';
  currentStaffId?: string | null;
}

export function ApprovalQueue({ multisig, stage, currentStaffId }: Props) {
  const { t } = useTranslation();
  const barWidth = Math.min(100, (multisig.collected / Math.max(multisig.required, 1)) * 100);
  const barBg =
    stage === 'failed' || stage === 'cancelled'
      ? 'var(--err)'
      : multisig.collected >= multisig.required
        ? 'var(--ok)'
        : 'var(--accent)';

  return (
    <div className="approval-box" style={{ marginBottom: 20 }}>
      <div className="approval-box-title">
        <span>
          <I.Shield size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
          {t('withdrawals.multisigApprovals')}
        </span>
        <span className="approval-count">
          {t('withdrawals.ofRequired', { n: multisig.collected, m: multisig.required })}
        </span>
      </div>

      <div className="approval-progress">
        <div className="approval-bar">
          <div className="approval-bar-fill" style={{ width: `${barWidth}%`, background: barBg }} />
        </div>
        <span className="text-xs text-muted">
          {t('withdrawals.remaining', { n: Math.max(0, multisig.required - multisig.collected) })}
        </span>
      </div>

      {multisig.rejectedBy && (
        <div className="perm-blocked" style={{ marginBottom: 12 }}>
          <I.UserX size={13} />
          <div>
            <div className="fw-500" style={{ fontSize: 12 }}>
              {t('withdrawals.rejectedBy', { name: multisig.rejectedBy })}
            </div>
            <div className="text-xs" style={{ marginTop: 2, opacity: 0.85 }}>
              {t('withdrawals.rejectedDetail')}
            </div>
          </div>
        </div>
      )}

      {multisig.approvers.length > 0 ? (
        <div>
          {multisig.approvers.map((a, i) => {
            const isMe = currentStaffId && currentStaffId === a.staffId;
            return (
              <div key={i} className="signer-row">
                <div className="avatar">{a.staffId.slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="signer-row-head">
                    <span className="signer-name text-mono text-xs">
                      {shortAddr(a.staffId, 6, 4)}
                    </span>
                    {isMe && <span className="signer-you">{t('withdrawals.you')}</span>}
                  </div>
                  <div className="signer-row-sub">
                    <span className="signer-dot signer-dot-ok" />
                    {t('withdrawals.signed')} <LiveTimeAgo at={a.at} />
                    {a.txSig && (
                      <>
                        {' '}
                        ·{' '}
                        <span className="text-mono text-faint">
                          {a.txSig.slice(0, 14)}…{a.txSig.slice(-6)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span className="approved-stamp">
                  <I.Check size={10} /> {t('withdrawals.signed')}
                </span>
              </div>
            );
          })}

          {/* Slots still awaiting */}
          {Array.from({ length: Math.max(0, multisig.required - multisig.collected) }, (_, i) => (
            <div key={`pending-${i}`} className="signer-row">
              <div className="avatar" style={{ opacity: 0.4 }}>
                —
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="signer-row-sub">
                  <span className="signer-dot signer-dot-pending" />
                  {t('withdrawals.awaitingSignature')}
                </div>
              </div>
              <span className="pending-stamp">
                <I.Clock size={10} /> {t('withdrawals.pending')}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted" style={{ padding: '8px 0' }}>
          No signatures collected yet — {multisig.required} required.
        </div>
      )}
    </div>
  );
}
