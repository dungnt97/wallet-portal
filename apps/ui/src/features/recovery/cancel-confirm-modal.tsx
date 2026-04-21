// Cancel confirm modal — warns ops about the irreversible 0-value self-send cancel-replace,
// requires a typed reason (min 10 chars), then submits POST /recovery/:entityType/:entityId/cancel.
// Idempotency key is generated client-side (UUID v4) so retries are safe.
// Solana txs: cancel button is disabled upstream (canCancel=false); this modal should never
// open for Solana, but renders a disabled state defensively if it does.
import { ApiError } from '@/api/client';
import { Modal, useToast } from '@/components/overlays';
import { I } from '@/icons';
import { shortHash } from '@/lib/format';
import type { StuckTxItem } from '@wp/shared-types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCancelTx } from './use-recovery';

interface Props {
  open: boolean;
  item: StuckTxItem | null;
  onClose: () => void;
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function CancelConfirmModal({ open, item, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const cancel = useCancelTx();

  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const [reason, setReason] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIdempotencyKey(newIdempotencyKey());
      setReason('');
      setApiError(null);
      cancel.reset();
    }
  }, [open, cancel.reset]);

  // Solana: defensively block action in UI even if modal is opened erroneously
  const isSolana = item?.chain === 'sol';
  const reasonValid = reason.trim().length >= 10;
  const canSubmit = !isSolana && reasonValid;

  const handleConfirm = async () => {
    if (!item || !canSubmit) return;
    setApiError(null);
    try {
      const result = await cancel.mutateAsync({ item, idempotencyKey });
      toast(
        t('recovery.cancel.success', { hash: shortHash(result.cancelTxHash, 6, 4) }),
        'success'
      );
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      setApiError(t('recovery.cancel.error', { msg }));
    }
  };

  const isPending = cancel.isPending;

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={isPending}>
        {t('common.back')}
      </button>
      <div className="spacer" />
      <button
        className="btn"
        style={
          canSubmit && !isPending ? { background: 'var(--err)', color: 'var(--err-fg)' } : undefined
        }
        onClick={() => void handleConfirm()}
        disabled={!canSubmit || isPending}
      >
        {isPending ? '…' : t('recovery.cancel.confirm')}
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={t('recovery.cancel.title')} footer={footer}>
      {!item ? null : (
        <>
          {/* Solana not supported — defensive banner */}
          {isSolana && (
            <div className="alert info" style={{ marginBottom: 16 }}>
              <I.AlertTri size={13} className="alert-icon" />
              <div className="alert-body">
                <div className="alert-title">{t('recovery.cancel.solanaTip')}</div>
              </div>
            </div>
          )}

          {apiError && (
            <div className="alert err" style={{ marginBottom: 12 }}>
              <I.AlertTri size={14} className="alert-icon" />
              <div className="alert-body">
                <div className="alert-text">{apiError}</div>
              </div>
            </div>
          )}

          {/* Big warning banner — always shown for EVM */}
          {!isSolana && (
            <div className="alert err" style={{ marginBottom: 16 }}>
              <I.AlertTri size={13} className="alert-icon" />
              <div className="alert-body">
                <div className="alert-title">{t('recovery.cancel.warningTitle')}</div>
                <div className="alert-text">{t('recovery.cancel.warningBody')}</div>
              </div>
            </div>
          )}

          {/* Current tx info */}
          <div className="field" style={{ marginBottom: 12 }}>
            <div className="field-label">{t('recovery.cancel.currentTxLabel')}</div>
            <div className="text-mono text-sm">{shortHash(item.txHash, 10, 6)}</div>
          </div>

          {/* Reason — required, min 10 chars */}
          <div className="field">
            <label htmlFor="cancel-reason" className="field-label">
              {t('recovery.cancel.reasonLabel')}
            </label>
            <textarea
              id="cancel-reason"
              className="textarea"
              rows={3}
              placeholder={t('recovery.cancel.reasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending || isSolana}
            />
            <div className="field-hint">{t('recovery.cancel.reasonHint')}</div>
          </div>
        </>
      )}
    </Modal>
  );
}
