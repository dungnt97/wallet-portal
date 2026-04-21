import { useRemoveSigner, useStaff } from '@/api/signer-ceremony-queries';
// Remove signer modal — treasurer picker + quorum warning + reason + step-up + POST /signers/remove.
// Warns if removal would bring the active set below threshold (2).
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import type { StaffMember } from '@wp/shared-types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const MIN_THRESHOLD = 2;

interface Props {
  onClose: () => void;
  onSuccess: (ceremonyId: string) => void;
}

export function RemoveSignerModal({ onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: allStaff = [], isPending: loadingStaff } = useStaff();
  const removeMutation = useRemoveSigner();

  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');

  // Only current active treasurers can be removed
  const treasurers = allStaff.filter(
    (s: StaffMember) => s.status === 'active' && s.role === 'treasurer'
  );
  const postRemoveCount = treasurers.length - 1;
  const belowThreshold = postRemoveCount < MIN_THRESHOLD;

  const selected = treasurers.find((s: StaffMember) => s.id === selectedId);
  const valid = Boolean(selectedId) && reason.trim().length > 0 && !belowThreshold;

  async function handleSubmit() {
    if (!valid) return;
    try {
      const result = await removeMutation.mutateAsync({ targetStaffId: selectedId, reason });
      toast(t('signers.remove.success'), 'success');
      onSuccess(result.ceremonyId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error');
      toast(msg, 'error');
    }
  }

  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="remove-staff-select">
          {t('signers.remove.staffLabel')}
        </label>
        {loadingStaff ? (
          <div className="text-xs text-muted">{t('common.loading')}</div>
        ) : (
          <select
            id="remove-staff-select"
            className="input"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">{t('signers.remove.staffPlaceholder')}</option>
            {treasurers.map((s: StaffMember) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.email}
              </option>
            ))}
          </select>
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
          </div>
        </div>
      )}

      {/* Quorum warning — shown when selection would drop below threshold */}
      {selectedId && belowThreshold && (
        <div className="alert err" style={{ marginBottom: 8 }}>
          <I.AlertTri size={13} className="alert-icon" />
          <div className="alert-body">
            <div className="alert-title">{t('signers.remove.belowThresholdTitle')}</div>
            <div className="alert-text">
              {t('signers.remove.belowThresholdBody', {
                count: postRemoveCount,
                min: MIN_THRESHOLD,
              })}
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking warning when set shrinks but stays above threshold */}
      {selectedId && !belowThreshold && (
        <div className="alert warn" style={{ marginBottom: 8 }}>
          <I.AlertTri size={13} className="alert-icon" />
          <div className="alert-body">
            <div className="alert-title">{t('signers.remove.shrinkTitle')}</div>
            <div className="alert-text">
              {t('signers.remove.shrinkBody', { post: postRemoveCount })}
            </div>
          </div>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="remove-reason">
          {t('signers.remove.reasonLabel')}
        </label>
        <textarea
          id="remove-reason"
          className="textarea"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('signers.remove.reasonPlaceholder')}
        />
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
          className="btn btn-danger"
          disabled={!valid || removeMutation.isPending}
          onClick={handleSubmit}
        >
          {removeMutation.isPending ? (
            t('signers.remove.submitting')
          ) : (
            <>
              <I.UserX size={13} /> {t('signers.remove.submit')}
            </>
          )}
        </button>
      </div>
    </>
  );
}
