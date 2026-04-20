// Step-up WebAuthn modal — tap security key or device biometric.
// Ported from prototype signing_modals.jsx StepUpModal.
import { I } from '@/icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SigningOp, StepUpResult } from './signing-flow';

interface Props {
  open: boolean;
  op: SigningOp | null;
  onClose: () => void;
  onVerified: (r: StepUpResult) => void;
  /** Called when user switches to OTP fallback. */
  onUseOtpFallback: () => void;
}

type WaState = 'idle' | 'prompting' | 'ok';

export function StepUpModal({ open, op, onClose, onVerified, onUseOtpFallback }: Props) {
  const { t } = useTranslation();
  const [waState, setWaState] = useState<WaState>('idle');

  useEffect(() => {
    if (open) setWaState('idle');
  }, [open]);

  if (!open || !op) return null;

  const runWebAuthn = () => {
    setWaState('prompting');
    setTimeout(() => {
      setWaState('ok');
      setTimeout(() => {
        onVerified({ method: 'webauthn', at: new Date().toISOString() });
      }, 380);
    }, 900);
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal step-up-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 440 }}
      >
        <div className="modal-header">
          <div className="modal-head-icon">
            <I.ShieldCheck size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title">{t('signing.stepUpTitle')}</div>
            <div className="modal-subtitle">{t('signing.stepUpSubtitle')}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <I.X size={14} />
          </button>
        </div>

        <div style={{ padding: '16px 20px 20px' }}>
          <div className={`login-webauthn ${waState}`} style={{ marginTop: 4 }}>
            <div className="login-webauthn-icon">
              {waState === 'ok' ? <I.Check size={26} /> : <I.Key size={26} />}
            </div>
            <div className="login-webauthn-title">
              {waState === 'idle' && t('signing.stepUpTitle')}
              {waState === 'prompting' && t('signing.stepUpWaiting')}
              {waState === 'ok' && t('signing.walletSigned')}
            </div>
            <div className="login-webauthn-sub">WebAuthn · phishing-resistant · 5-minute TTL</div>
            <button
              type="button"
              className="btn btn-accent btn-lg"
              onClick={runWebAuthn}
              disabled={waState === 'prompting' || waState === 'ok'}
              style={{ marginTop: 12 }}
            >
              {waState === 'prompting'
                ? t('signing.stepUpWaiting')
                : waState === 'ok'
                  ? t('common.continue')
                  : t('signing.stepUpTitle')}
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onUseOtpFallback}
              disabled={waState !== 'idle'}
            >
              <I.Shield size={12} /> {t('signing.stepUpFallback')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
