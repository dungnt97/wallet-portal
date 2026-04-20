// Policy block modal — shown when policy evaluation fails at review stage.
// Mirrors prototype signing_modals.jsx 'Blocked by policy' terminal state.
import { I } from '@/icons';
import { useTranslation } from 'react-i18next';
import { evaluatePolicy } from './policy-preview';
import type { SigningOp } from './signing-flow';

interface Props {
  open: boolean;
  op: SigningOp | null;
  onClose: () => void;
}

export function PolicyBlockModal({ open, op, onClose }: Props) {
  const { t } = useTranslation();
  if (!open || !op) return null;
  const policy = evaluatePolicy(op);
  const failed = policy.checks.filter((c) => !c.ok && !c.warning);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal policy-block-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 440 }}
      >
        <div className="modal-header">
          <div className="modal-head-icon" style={{ color: 'var(--err-text)' }}>
            <I.AlertTri size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title">{t('signing.policyBlockTitle')}</div>
            <div className="modal-subtitle">{t('signing.policyBlockSubtitle')}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <I.X size={14} />
          </button>
        </div>

        <div style={{ padding: '16px 20px 20px' }}>
          <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
            {t('signing.policyBlockText')}
          </p>
          <div className="policy-trace">
            {failed.map((c) => (
              <div key={c.key} className="policy-row err">
                <span className="policy-icon">
                  <I.Close size={11} />
                </span>
                <span className="policy-label">{c.label}</span>
                <span className="policy-detail text-xs text-faint">{c.detail}</span>
              </div>
            ))}
          </div>

          <div className="modal-footer" style={{ marginTop: 16 }}>
            <div className="spacer" />
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t('signing.policyBlockClose')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
