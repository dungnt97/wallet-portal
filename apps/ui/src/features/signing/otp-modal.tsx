// OTP (TOTP) fallback modal — 6-digit code from authenticator app.
// Ported from prototype signing_modals.jsx StepUpModal (totp branch).
import { I } from '@/icons';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SigningOp, StepUpResult } from './signing-flow';

interface Props {
  open: boolean;
  op: SigningOp | null;
  onClose: () => void;
  onVerified: (r: StepUpResult) => void;
  /** Return back to WebAuthn (security key) mode. */
  onBackToStepUp: () => void;
}

export function OtpModal({ open, op, onClose, onVerified, onBackToStepUp }: Props) {
  const { t } = useTranslation();
  const [otp, setOtp] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setOtp('');
      setErr('');
    }
  }, [open]);

  if (!open || !op) return null;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setErr('Enter the 6-digit code.');
      return;
    }
    setTimeout(() => {
      onVerified({ method: 'totp', at: new Date().toISOString() });
    }, 200);
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal otp-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 420 }}
      >
        <div className="modal-header">
          <div className="modal-head-icon">
            <I.Shield size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title">{t('signing.otpTitle')}</div>
            <div className="modal-subtitle">{t('signing.otpSubtitle')}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <I.X size={14} />
          </button>
        </div>

        <form onSubmit={submit} className="login-totp" style={{ padding: '10px 20px 20px' }}>
          <label className="field">
            <span className="field-label">{t('signing.otpSubtitle')}</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="input otp-input"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              // biome-ignore lint/a11y/noAutofocus: expected UX for OTP modal
              autoFocus
              placeholder="000000"
            />
          </label>
          {err && <div className="login-err">{err}</div>}

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onBackToStepUp}>
              <I.ArrowLeft size={12} /> {t('signing.otpBack')}
            </button>
            <div className="spacer" />
            <button type="submit" className="btn btn-primary" disabled={otp.length !== 6}>
              {t('signing.otpVerify')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
