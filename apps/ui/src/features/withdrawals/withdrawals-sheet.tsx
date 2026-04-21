// Withdrawal detail sheet — amount header, approval queue, details, action footer.
// Execute visible when: threshold met (stage=executing) + time_lock expired.
// Cancel button for cold-tier withdrawals in cancellable states.
import { useAuth } from '@/auth/use-auth';
import { ChainPill, StatusBadge, TokenPill } from '@/components/custody';
import { DetailSheet, useToast } from '@/components/overlays';
import { I } from '@/icons';
import { CHAINS, ROLES } from '@/lib/constants';
import { fmtDateTime, fmtUSD, shortHash } from '@/lib/format';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TimeLeftDisplay } from '../cold/time-left-display';
import { ApprovalQueue } from './approval-queue';
import { CancelWithdrawalModal } from './cancel-withdrawal-modal';
import type { WithdrawalRow } from './withdrawal-types';

interface Props {
  withdrawal: WithdrawalRow | null;
  onClose: () => void;
  onApprove: (w: WithdrawalRow) => void;
  onReject: (w: WithdrawalRow) => void;
  onExecute: (w: WithdrawalRow) => void;
  onSubmitDraft: (w: WithdrawalRow) => void;
}

export function WithdrawalSheet({
  withdrawal,
  onClose,
  onApprove,
  onReject,
  onExecute,
  onSubmitDraft,
}: Props) {
  const { staff, hasPerm } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const canApprove = hasPerm('withdrawal.approve');
  const canExecute = hasPerm('withdrawal.execute');
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!withdrawal) return null;
  const w = withdrawal;

  const timeLockExpiresAt = w.timeLockExpiresAt;
  const sourceTier = w.sourceTier ?? 'hot';
  const timeLockActive = timeLockExpiresAt ? new Date(timeLockExpiresAt) > new Date() : false;

  const alreadyApproved = staff && w.multisig.approvers.some((a) => a.staffId === staff.id);

  const showExecute = w.stage === 'executing' && canExecute && !timeLockActive;

  const cancellableStatus = ['time_locked', 'awaiting_signatures', 'draft'].includes(w.stage);
  const showCancel = sourceTier === 'cold' && cancellableStatus && hasPerm('withdrawals.cancel');

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>
        {t('withdrawals.close')}
      </button>
      <div className="spacer" />

      {showCancel && (
        <button
          className="btn"
          style={{ color: 'var(--err-text)', borderColor: 'var(--err)' }}
          onClick={() => setCancelOpen(true)}
        >
          <I.X size={12} /> {t('withdrawals.cancel.btn')}
        </button>
      )}

      {w.stage === 'draft' && (
        <button className="btn btn-accent" onClick={() => onSubmitDraft(w)}>
          {t('withdrawals.submitToMultisig')}
        </button>
      )}

      {w.stage === 'awaiting_signatures' && canApprove && !alreadyApproved && (
        <>
          <button
            className="btn btn-ghost"
            onClick={() => onReject(w)}
            style={{ color: 'var(--err-text)' }}
          >
            <I.UserX size={12} /> {t('withdrawals.rejectBtn')}
          </button>
          <button className="btn btn-accent" onClick={() => onApprove(w)}>
            <I.ShieldCheck size={12} /> {t('withdrawals.approveSign')}
          </button>
        </>
      )}

      {showExecute && (
        <button
          className="btn btn-primary"
          onClick={() => {
            onExecute(w);
            toast(t('withdrawals.executeQueued'), 'success');
          }}
        >
          <I.Send size={11} /> {t('withdrawals.executeOnChain')}
        </button>
      )}

      {w.stage === 'executing' && timeLockActive && (
        <span className="text-xs text-muted" style={{ padding: '0 8px' }}>
          <I.Lock size={11} />{' '}
          {t('common.timeLockActive', {
            defaultValue: 'Time-lock active until {{until}}',
            until: timeLockExpiresAt ? new Date(timeLockExpiresAt).toLocaleString() : '…',
          })}
        </span>
      )}

      {w.stage === 'awaiting_signatures' && canApprove && alreadyApproved && (
        <span className="approved-stamp">
          <I.Check size={10} /> {t('withdrawals.youSigned')}
        </span>
      )}

      {w.stage === 'awaiting_signatures' && staff && !canApprove && (
        <button className="btn btn-secondary" disabled title={t('withdrawals.treasurersOnlyTip')}>
          <I.Lock size={12} /> {t('withdrawals.treasurersOnly')}
        </button>
      )}
    </>
  );

  return (
    <>
      <DetailSheet
        open={!!withdrawal}
        onClose={onClose}
        wide
        title={t('withdrawals.sheetTitle', { id: w.id.slice(0, 12) })}
        subtitle={t('withdrawals.sheetSub', {
          amt: fmtUSD(w.amount),
          token: w.token,
          chain: CHAINS[w.chain].name,
        })}
        footer={footer}
      >
        <div style={{ marginBottom: 20 }}>
          <div className="text-xs text-muted">{t('withdrawals.dId')}</div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmtUSD(w.amount)} <span className="text-muted text-sm fw-500">{w.token}</span>
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 4 }}>
            to <span className="text-mono">{shortHash(w.destination, 10, 8)}</span> ·{' '}
            {CHAINS[w.chain].name}
          </div>
        </div>

        {timeLockExpiresAt && (
          <div style={{ marginBottom: 16 }}>
            <TimeLeftDisplay unlockAt={timeLockExpiresAt} />
          </div>
        )}

        <ApprovalQueue
          multisig={w.multisig}
          stage={w.stage}
          chain={w.chain}
          currentStaffId={staff?.id}
        />

        <h4 className="section-head">{t('withdrawals.details')}</h4>
        <dl className="dl">
          <dt>{t('withdrawals.dId')}</dt>
          <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
            {w.id}
          </dd>
          <dt>{t('withdrawals.dStatus')}</dt>
          <dd>
            <StatusBadge status={w.stage} />
          </dd>
          {sourceTier === 'cold' && (
            <>
              <dt>{t('withdrawals.dTier')}</dt>
              <dd>
                <span className="badge-tight info">
                  <I.Lock size={9} /> {t('withdrawals.tierCold')}
                </span>
              </dd>
            </>
          )}
          <dt>{t('withdrawals.dChain')}</dt>
          <dd>
            <ChainPill chain={w.chain} /> {CHAINS[w.chain].name}
          </dd>
          <dt>{t('withdrawals.dAsset')}</dt>
          <dd>
            <TokenPill token={w.token} />
          </dd>
          <dt>{t('withdrawals.dDest')}</dt>
          <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
            {w.destination}
          </dd>
          <dt>{t('withdrawals.dCreated')}</dt>
          <dd>{fmtDateTime(w.createdAt)}</dd>
          {w.txHash && (
            <>
              <dt>{t('withdrawals.dTxHash')}</dt>
              <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
                {w.txHash}
              </dd>
            </>
          )}
          {timeLockExpiresAt && (
            <>
              <dt>{t('withdrawals.timelock.label')}</dt>
              <dd>
                <TimeLeftDisplay unlockAt={timeLockExpiresAt} compact />
              </dd>
            </>
          )}
          {w.note && (
            <>
              <dt>{t('withdrawals.dMemo')}</dt>
              <dd>{w.note}</dd>
            </>
          )}
        </dl>
      </DetailSheet>

      <CancelWithdrawalModal
        open={cancelOpen}
        withdrawalId={w.id}
        onClose={() => setCancelOpen(false)}
      />
    </>
  );
}
