import { I } from '@/icons';
// Reject transaction modal — capture rejection reason + optional comment.
// Ported from prototype signing_modals.jsx RejectTxModal.
import { useEffect, useState } from 'react';
import type { SigningOp } from './signing-flow';

const REASONS = [
  { value: 'wrong-destination', label: 'Wrong destination' },
  { value: 'wrong-amount', label: 'Wrong amount' },
  { value: 'off-policy', label: 'Off policy (daily limit / whitelist)' },
  { value: 'suspicious', label: 'Suspicious request' },
  { value: 'duplicate', label: 'Duplicate operation' },
  { value: 'other', label: 'Other' },
];

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
  const [reason, setReason] = useState('wrong-destination');
  const [comment, setComment] = useState('');

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
            <div className="modal-title">Reject operation {op.id}</div>
            <div className="modal-subtitle">Counted as a rejection on-chain</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <I.X size={14} />
          </button>
        </div>

        <div className="field">
          <div className="field-label">Reason</div>
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
            Comment <span className="text-faint">· optional, visible to other signers</span>
          </span>
          <textarea
            className="input"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Why are you rejecting?"
          />
        </label>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              onRejected({ reason, comment });
              onClose();
            }}
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
