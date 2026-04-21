// Withdrawal detail sheet — amount header, approval queue, details, action footer.
// Execute button visible only when: threshold met (stage=executing) + time_lock expired.
import { useAuth } from '@/auth/use-auth';
import { ChainPill, Risk, StatusBadge, TokenPill } from '@/components/custody';
import { DetailSheet, useToast } from '@/components/overlays';
import { I } from '@/icons';
import { CHAINS, ROLES } from '@/lib/constants';
import { fmtDateTime, fmtUSD, shortHash } from '@/lib/format';
import { useTweaksStore } from '@/stores/tweaks-store';
import { useTranslation } from 'react-i18next';
import { type FixWithdrawal, TREASURERS } from '../_shared/fixtures';
import { ApprovalQueue } from './approval-queue';

interface Props {
  withdrawal: FixWithdrawal | null;
  onClose: () => void;
  onApprove: (w: FixWithdrawal) => void;
  onReject: (w: FixWithdrawal) => void;
  onExecute: (w: FixWithdrawal) => void;
  onSubmitDraft: (w: FixWithdrawal) => void;
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
  const showRiskFlags = useTweaksStore((s) => s.showRiskFlags);

  if (!withdrawal) return null;
  const w = withdrawal;

  const requester = TREASURERS.find((s) => s.id === w.requestedBy);
  const alreadyApproved = staff && w.multisig.approvers.some((a) => a.staffId === staff.id);

  // Time-lock check: read from server field if present, otherwise allow execute
  const timeLockExpiresAt = (w as unknown as Record<string, unknown>).timeLockExpiresAt as
    | string
    | undefined;
  const timeLockActive = timeLockExpiresAt ? new Date(timeLockExpiresAt) > new Date() : false;

  // Execute button: visible when stage=executing (threshold met) AND time-lock not active
  const showExecute = w.stage === 'executing' && canExecute && !timeLockActive;

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>
        {t('withdrawals.close')}
      </button>
      <div className="spacer" />

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
    <DetailSheet
      open={!!withdrawal}
      onClose={onClose}
      wide
      title={t('withdrawals.sheetTitle', { id: w.id })}
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

      <ApprovalQueue
        multisig={w.multisig}
        stage={w.stage}
        chain={w.chain}
        currentStaffId={staff?.id}
      />

      <h4 className="section-head">{t('withdrawals.details')}</h4>
      <dl className="dl">
        <dt>{t('withdrawals.dId')}</dt>
        <dd className="text-mono">{w.id}</dd>
        <dt>{t('withdrawals.dStatus')}</dt>
        <dd>
          <StatusBadge status={w.stage} />
        </dd>
        <dt>{t('withdrawals.dVault')}</dt>
        <dd>{w.chain === 'bnb' ? t('withdrawals.vaultBsc') : t('withdrawals.vaultSol')}</dd>
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
        <dt>{t('withdrawals.dRequestedBy')}</dt>
        <dd className="hstack">
          {requester?.name || '—'}
          {requester && (
            <span className={`role-pill role-${requester.role}`}>
              {ROLES[requester.role]?.label}
            </span>
          )}
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
            <dt>Time-lock</dt>
            <dd className="text-xs text-muted">
              {timeLockActive
                ? `Active until ${new Date(timeLockExpiresAt).toLocaleString()}`
                : `Expired ${new Date(timeLockExpiresAt).toLocaleString()}`}
            </dd>
          </>
        )}
        {showRiskFlags && (
          <>
            <dt>{t('withdrawals.dRisk')}</dt>
            <dd>
              <Risk level={w.risk} />
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
  );
}
