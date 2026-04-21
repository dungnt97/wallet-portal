import { useRotateSigners, useStaff } from '@/api/signer-ceremony-queries';
// Rotate signers modal — multi-select add + remove + post-state preview + step-up.
// POST /signers/rotate — single ceremony atomically swaps owner sets on both chains.
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

export function RotateSignersModal({ onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: allStaff = [], isPending: loadingStaff } = useStaff();
  const rotateMutation = useRotateSigners();

  const [addIds, setAddIds] = useState<Set<string>>(new Set());
  const [removeIds, setRemoveIds] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');

  const treasurers = allStaff.filter(
    (s: StaffMember) => s.status === 'active' && s.role === 'treasurer'
  );
  const candidates = allStaff.filter(
    (s: StaffMember) => s.status === 'active' && s.role !== 'treasurer'
  );

  const postCount = treasurers.length + addIds.size - removeIds.size;
  const belowThreshold = postCount < MIN_THRESHOLD;
  const overlap = [...addIds].some((id) => removeIds.has(id));

  const valid =
    addIds.size > 0 &&
    removeIds.size > 0 &&
    !overlap &&
    !belowThreshold &&
    reason.trim().length > 0;

  function toggleAdd(id: string) {
    setAddIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRemove(id: string) {
    setRemoveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!valid) return;
    try {
      const result = await rotateMutation.mutateAsync({
        addStaffIds: [...addIds],
        removeStaffIds: [...removeIds],
        reason,
      });
      toast(t('signers.rotate.success'), 'success');
      onSuccess(result.ceremonyId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error');
      toast(msg, 'error');
    }
  }

  if (loadingStaff) {
    return <div className="text-xs text-muted">{t('common.loading')}</div>;
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* ADD column */}
        <div>
          <div className="field-label" style={{ marginBottom: 6 }}>
            <I.UserPlus size={11} /> {t('signers.rotate.addLabel')}
          </div>
          {candidates.length === 0 ? (
            <div className="text-xs text-muted">{t('signers.rotate.noAddCandidates')}</div>
          ) : (
            <div className="staff-checklist">
              {candidates.map((s: StaffMember) => (
                <label
                  key={s.id}
                  className={`staff-check-row ${addIds.has(s.id) ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={addIds.has(s.id)}
                    onChange={() => toggleAdd(s.id)}
                  />
                  <div>
                    <div className="text-sm fw-500">{s.name}</div>
                    <div className="text-xs text-muted">{s.email}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* REMOVE column */}
        <div>
          <div className="field-label" style={{ marginBottom: 6 }}>
            <I.UserX size={11} /> {t('signers.rotate.removeLabel')}
          </div>
          {treasurers.length === 0 ? (
            <div className="text-xs text-muted">{t('signers.rotate.noRemoveCandidates')}</div>
          ) : (
            <div className="staff-checklist">
              {treasurers.map((s: StaffMember) => (
                <label
                  key={s.id}
                  className={`staff-check-row ${removeIds.has(s.id) ? 'selected err' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={removeIds.has(s.id)}
                    onChange={() => toggleRemove(s.id)}
                  />
                  <div>
                    <div className="text-sm fw-500">{s.name}</div>
                    <div className="text-xs text-muted">{s.email}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Post-state preview */}
      <div className="card" style={{ background: 'var(--bg-sunken)', padding: 10, marginTop: 12 }}>
        <div className="hstack" style={{ gap: 16 }}>
          <div className="text-xs text-muted">
            {t('signers.rotate.postCount')}:{' '}
            <strong className={belowThreshold ? 'text-err' : ''}>
              {postCount} {t('signers.rotate.owners')}
            </strong>
          </div>
          <div className="text-xs text-muted">
            {t('signers.rotate.threshold')}:{' '}
            <strong>
              {MIN_THRESHOLD}-of-{postCount}
            </strong>
          </div>
          {belowThreshold && (
            <span className="badge-tight err">{t('signers.rotate.belowMin')}</span>
          )}
          {overlap && <span className="badge-tight err">{t('signers.rotate.overlapError')}</span>}
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label className="field-label" htmlFor="rotate-reason">
          {t('signers.rotate.reasonLabel')}
        </label>
        <textarea
          id="rotate-reason"
          className="textarea"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('signers.rotate.reasonPlaceholder')}
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
          className="btn btn-accent"
          disabled={!valid || rotateMutation.isPending}
          onClick={handleSubmit}
        >
          {rotateMutation.isPending ? (
            t('signers.rotate.submitting')
          ) : (
            <>
              <I.Key size={13} /> {t('signers.rotate.submit')}
            </>
          )}
        </button>
      </div>
    </>
  );
}
