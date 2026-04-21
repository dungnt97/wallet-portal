import { useAddSigner, useStaff } from '@/api/signer-ceremony-queries';
// Add signer modal — staff picker + reason + WebAuthn step-up + POST /signers/add.
// Staff picker shows only active staff who are NOT already treasurers.
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import type { StaffMember } from '@wp/shared-types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  onClose: () => void;
  onSuccess: (ceremonyId: string) => void;
}

export function AddSignerModal({ onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: allStaff = [], isPending: loadingStaff } = useStaff();
  const addMutation = useAddSigner();

  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');

  // Only show active non-treasurer staff
  const candidates = allStaff.filter(
    (s: StaffMember) => s.status === 'active' && s.role !== 'treasurer'
  );

  const selected = candidates.find((s: StaffMember) => s.id === selectedId);
  const valid = Boolean(selectedId) && reason.trim().length > 0;

  async function handleSubmit() {
    if (!valid) return;
    try {
      const result = await addMutation.mutateAsync({ targetStaffId: selectedId, reason });
      toast(t('signers.add.success'), 'success');
      onSuccess(result.ceremonyId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error');
      toast(msg, 'error');
    }
  }

  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="add-staff-select">
          {t('signers.add.staffLabel')}
        </label>
        {loadingStaff ? (
          <div className="text-xs text-muted">{t('common.loading')}</div>
        ) : (
          <select
            id="add-staff-select"
            className="input"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">{t('signers.add.staffPlaceholder')}</option>
            {candidates.map((s: StaffMember) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.email}
              </option>
            ))}
          </select>
        )}
        {candidates.length === 0 && !loadingStaff && (
          <div className="text-xs text-muted" style={{ marginTop: 4 }}>
            {t('signers.add.noEligibleStaff')}
          </div>
        )}
      </div>

      {selected && (
        <div
          className="card"
          style={{ background: 'var(--bg-sunken)', padding: 12, marginBottom: 8 }}
        >
          <div className="hstack" style={{ gap: 8 }}>
            <div className="avatar">{selected.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <div className="fw-500 text-sm">{selected.name}</div>
              <div className="text-xs text-muted">{selected.email}</div>
            </div>
            <div className="spacer" />
            <span className="badge-tight info">{selected.role}</span>
          </div>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="add-reason">
          {t('signers.add.reasonLabel')}
        </label>
        <textarea
          id="add-reason"
          className="textarea"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('signers.add.reasonPlaceholder')}
        />
      </div>

      <div className="alert info" style={{ marginTop: 8 }}>
        <I.Info size={13} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">{t('signers.add.prereqTitle')}</div>
          <div className="alert-text">{t('signers.add.prereqBody')}</div>
        </div>
      </div>

      <div className="alert warn" style={{ marginTop: 8 }}>
        <I.Shield size={13} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">{t('signers.add.stepUpTitle')}</div>
          <div className="alert-text">{t('signers.add.stepUpBody')}</div>
        </div>
      </div>

      <div className="hstack" style={{ marginTop: 20, gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="btn btn-accent"
          disabled={!valid || addMutation.isPending}
          onClick={handleSubmit}
        >
          {addMutation.isPending ? (
            t('signers.add.submitting')
          ) : (
            <>
              <I.UserPlus size={13} /> {t('signers.add.submit')}
            </>
          )}
        </button>
      </div>
    </>
  );
}
