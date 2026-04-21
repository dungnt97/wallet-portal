// ConfirmToggleModal — requires a typed reason before enabling/disabling the kill-switch.
// reason is optional when disabling (operator may want a quick re-enable after incident).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  targetEnabled: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ConfirmToggleModal({ open, targetEnabled, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm(reason.trim());
    setReason('');
  };

  const handleCancel = () => {
    setReason('');
    onCancel();
  };

  const confirmDisabled = targetEnabled && reason.trim().length === 0;

  return (
    <div className="modal-backdrop" onClick={handleCancel}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {targetEnabled
              ? t('ops.killSwitch.confirmEnableTitle')
              : t('ops.killSwitch.confirmDisableTitle')}
          </h2>
        </div>

        <div className="modal-body">
          <p className="text-muted" style={{ marginBottom: 16, fontSize: 13 }}>
            {targetEnabled
              ? t('ops.killSwitch.confirmEnableBody')
              : t('ops.killSwitch.confirmDisableBody')}
          </p>

          <label className="field-label" htmlFor="ks-reason">
            {t('ops.killSwitch.reasonLabel')}
            {targetEnabled && <span style={{ color: 'var(--c-red)', marginLeft: 4 }}>*</span>}
          </label>
          <input
            id="ks-reason"
            className="field-input"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('ops.killSwitch.reasonPlaceholder')}
            maxLength={255}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !confirmDisabled) handleConfirm();
              if (e.key === 'Escape') handleCancel();
            }}
          />
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={handleCancel}>
            {t('ops.killSwitch.cancelBtn')}
          </button>
          <button
            className={`btn ${targetEnabled ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleConfirm}
            disabled={confirmDisabled}
          >
            {targetEnabled
              ? t('ops.killSwitch.confirmEnableBtn')
              : t('ops.killSwitch.confirmDisableBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
