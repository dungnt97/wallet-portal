// Cancel withdrawal modal — confirms cancellation of a cold withdrawal in time_locked/pending/approved.
// Requires a typed reason; posts POST /withdrawals/:id/cancel.
import { ApiError } from '@/api/client';
import { useCancelWithdrawal } from '@/api/queries';
import { Sheet, useToast } from '@/components/overlays';
import { I } from '@/icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  withdrawalId: string | null;
  onClose: () => void;
}

export function CancelWithdrawalModal({ open, withdrawalId, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  const cancelMutation = useCancelWithdrawal(withdrawalId ?? '');
  const resetMutation = cancelMutation.reset;

  useEffect(() => {
    if (open) {
      setReason('');
      setApiError(null);
      resetMutation();
    }
  }, [open, resetMutation]);

  const valid = reason.trim().length >= 3;

  const handleConfirm = async () => {
    if (!withdrawalId || !valid) return;
    setApiError(null);
    try {
      await cancelMutation.mutateAsync({ reason: reason.trim() });
      toast(t('withdrawals.cancel.success'), 'success');
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(t('withdrawals.cancel.error', { msg: err.message }));
      } else {
        setApiError(t('withdrawals.cancel.error', { msg: String(err) }));
      }
    }
  };

  const isPending = cancelMutation.isPending;

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={isPending}>
        {t('common.back')}
      </button>
      <div className="spacer" />
      <button
        className="btn"
        style={{ background: 'var(--err)', color: 'var(--err-fg)' }}
        onClick={handleConfirm}
        disabled={!valid || isPending}
      >
        {isPending ? '…' : t('withdrawals.cancel.confirm')}
      </button>
    </>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('withdrawals.cancel.title')}
      subtitle={t('withdrawals.cancel.subtitle')}
      footer={footer}
    >
      {apiError && (
        <div className="alert err" style={{ marginBottom: 12 }}>
          <I.AlertTri size={14} className="alert-icon" />
          <div className="alert-body">
            <div className="alert-text">{apiError}</div>
          </div>
        </div>
      )}

      <div className="alert warn" style={{ marginBottom: 16 }}>
        <I.AlertTri size={13} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">{t('withdrawals.cancel.warningTitle')}</div>
          <div className="alert-text">{t('withdrawals.cancel.warningBody')}</div>
        </div>
      </div>

      <div className="field">
        <label htmlFor="cancel-reason" className="field-label">
          {t('withdrawals.cancel.reasonLabel')}
        </label>
        <textarea
          id="cancel-reason"
          className="textarea"
          rows={3}
          placeholder={t('withdrawals.cancel.reasonPlaceholder')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={isPending}
        />
        <div className="field-hint">{t('withdrawals.cancel.reasonHint')}</div>
      </div>
    </Sheet>
  );
}
