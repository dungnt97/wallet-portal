import { I } from '@/icons';
// Reject transaction modal — capture rejection reason + optional comment.
// Ported from prototype signing_modals.jsx RejectTxModal.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SigningOp } from './signing-flow';

export interface RejectReason {
  reason: string;
  comment: string;
}

interface Props {
  open: boolean;
  op: SigningOp | null;
  onClose: () => void;
  onRejected: (r: RejectReason) => void;
}

export function RejectTxModal({ open, op, onClose, onRejected }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('wrong-destination');
  const [comment, setComment] = useState('');

  // Build REASONS inside the component so labels are reactive to locale changes
  const REASONS = [
    { value: 'wrong-destination', label: t('signing.reasonWrongDest') },
    { value: 'wrong-amount', label: t('signing.reasonWrongAmount') },
    { value: 'off-policy', label: t('signing.reasonOffPolicy') },
    { value: 'suspicious', label: t('signing.reasonSuspicious') },
    { value: 'duplicate', label: t('signing.reasonDuplicate') },
    { value: 'other', label: t('signing.reasonOther') },
  ];

  useEffect(() => {
    if (open) {
      setReason('wrong-destination');
      setComment('');
    }
  }, [open]);

  if (!open || !op) return null;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal reject-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">{t('signing.rejectOpTitle', { id: op.id })}</div>
            <div className="modal-subtitle">{t('signing.rejectOnChainNote')}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <I.X size={14} />
          </button>
        </div>

        <div className="field">
          <div className="field-label">{t('signing.reasonLabel')}</div>
          <div className="reject-reasons">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className={`reject-reason ${reason === r.value ? 'picked' : ''}`}
              >
                <input
                  type="radio"
                  name="reject-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                />
                <span>{r.label}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">
            {t('signing.commentLabel')}{' '}
            <span className="text-faint">{t('signing.commentOptional')}</span>
          </span>
          <textarea
            className="input"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('signing.commentPlaceholder')}
          />
        </label>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('signing.cancel')}
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              onRejected({ reason, comment });
              onClose();
            }}
          >
            {t('signing.reject')}
          </button>
        </div>
      </div>
    </div>
  );
}
