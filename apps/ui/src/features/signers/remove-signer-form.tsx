// Remove signer form — sheet body. Requires reason + admin warning.
import { I } from '@/icons';
import { useState } from 'react';
import type { SignerRow } from './signers-fixtures';

interface Props {
  signer: SignerRow;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}

export function RemoveSignerForm({ signer, onSubmit, onCancel }: Props) {
  const [reason, setReason] = useState('');
  return (
    <>
      <div
        className="card"
        style={{ background: 'var(--bg-sunken)', padding: 16, marginBottom: 16 }}
      >
        <div className="hstack">
          <div className="avatar">{signer.initials}</div>
          <div>
            <div className="fw-500">{signer.name}</div>
            <div className="text-xs text-muted">{signer.email}</div>
          </div>
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="remove-reason">
          Reason
        </label>
        <textarea
          id="remove-reason"
          className="textarea"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Off-boarding, compromised key suspected, role change"
        />
      </div>
      <div className="alert err" style={{ marginTop: 8 }}>
        <I.AlertTri size={13} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">This reduces the signer set</div>
          <div className="alert-text">
            The remaining signers still need to meet threshold (2/3) for all future withdrawals. Add
            a replacement before removing if you want to maintain 3 signers.
          </div>
        </div>
      </div>
      <div className="hstack" style={{ marginTop: 20, gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="btn btn-danger"
          disabled={!reason}
          onClick={() => onSubmit(reason)}
        >
          Propose removal
        </button>
      </div>
    </>
  );
}
