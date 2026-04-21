// Bump confirm modal — shows stuck tx details, explains the +15% gas bump, and
// submits POST /recovery/:entityType/:entityId/bump after user confirms.
// Idempotency key is generated client-side (UUID v4) so retries are safe.
import { ApiError } from '@/api/client';
import { Modal, useToast } from '@/components/overlays';
import { I } from '@/icons';
import { shortHash } from '@/lib/format';
import type { StuckTxItem } from '@wp/shared-types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBumpTx } from './use-recovery';

interface Props {
  open: boolean;
  item: StuckTxItem | null;
  onClose: () => void;
}

/** Generate a UUID v4 using crypto.randomUUID (available in all modern browsers + Node 16+). */
function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function BumpConfirmModal({ open, item, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const bump = useBumpTx();

  // Stable idempotency key per modal open — regenerated each time modal opens.
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // Fresh key on each open so a reopened modal doesn't replay the previous request.
      setIdempotencyKey(newIdempotencyKey());
      setApiError(null);
      bump.reset();
    }
  }, [open, bump.reset]);

  const handleConfirm = async () => {
    if (!item) return;
    setApiError(null);
    try {
      const result = await bump.mutateAsync({ item, idempotencyKey });
      toast(t('recovery.bump.success', { hash: shortHash(result.newTxHash, 6, 4) }), 'success');
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      setApiError(t('recovery.bump.error', { msg }));
    }
  };

  const isPending = bump.isPending;

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={isPending}>
        {t('common.back')}
      </button>
      <div className="spacer" />
      <button
        className="btn"
        style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        onClick={() => void handleConfirm()}
        disabled={isPending}
      >
        {isPending ? '…' : t('recovery.bump.confirm')}
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={t('recovery.bump.title')} footer={footer}>
      {!item ? null : (
        <>
          {apiError && (
            <div className="alert err" style={{ marginBottom: 12 }}>
              <I.AlertTri size={14} className="alert-icon" />
              <div className="alert-body">
                <div className="alert-text">{apiError}</div>
              </div>
            </div>
          )}

          {/* Current tx info */}
          <div className="field" style={{ marginBottom: 12 }}>
            <div className="field-label">{t('recovery.bump.currentTxLabel')}</div>
            <div className="text-mono text-sm">{shortHash(item.txHash, 10, 6)}</div>
          </div>

          {/* Bump explanation */}
          <div className="alert warn" style={{ marginBottom: 16 }}>
            <I.Zap size={13} className="alert-icon" />
            <div className="alert-body">
              <div className="alert-title">{t('recovery.bump.infoTitle')}</div>
              <div className="alert-text">
                {t('recovery.bump.infoBody', {
                  multiplier: `×${(1.15 ** (item.bumpCount + 1)).toFixed(4)}`,
                  count: item.bumpCount + 1,
                })}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 8 }}>
            <div>
              <div className="text-xs text-muted">{t('recovery.bump.bumpCount')}</div>
              <div className="fw-600">{item.bumpCount + 1}</div>
            </div>
            <div>
              <div className="text-xs text-muted">{t('recovery.bump.chain')}</div>
              <div className="fw-600 text-mono">{item.chain.toUpperCase()}</div>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
