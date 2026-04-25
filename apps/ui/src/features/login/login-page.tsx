import { api } from '@/api/client';
import { useAuth } from '@/auth/use-auth';
import { I } from '@/icons';
// Login page — 1:1 port of prototype `portal/src/page_login.jsx`.
// 3-step flow: `sso` (Google + email input + password fallback entry)
// → `credentials` (email + password form) → `2fa` (WebAuthn key OR TOTP 6-digit).
// Right column lists demo accounts that short-circuit via POST /auth/session/dev-login
// when VITE_AUTH_DEV_MODE=true (backend AUTH_DEV_MODE must also be true).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GoogleGlyph } from './google-glyph';
import type { DemoStaff, Role, StepMode, TwoFaMode, WaState } from './login-types';
import { DEMO_STAFF, POLICY_REQUIRED, POLICY_TOTAL, ROLE_LABEL } from './login-types';

const IS_DEV_MODE = import.meta.env.VITE_AUTH_DEV_MODE === 'true';

export function LoginPage() {
  const { t } = useTranslation();
  const { initiateLogin, refresh } = useAuth();
  const [email, setEmail] = useState('mira@treasury.io');
  const [password, setPassword] = useState('••••••••••');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<StepMode>('sso');
  const [mode2fa, setMode2fa] = useState<TwoFaMode>('webauthn');
  const [waState, setWaState] = useState<WaState>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ssoEmail, setSsoEmail] = useState('');

  const activeEmail = (ssoEmail || email).trim().toLowerCase();
  const staff: DemoStaff | undefined = DEMO_STAFF.find(
    (s) => s.email.toLowerCase() === activeEmail
  );

  const devLogin = async (loginEmail: string) => {
    const res = await api.post<{ id: string; role: Role }>('/auth/session/dev-login', {
      email: loginEmail,
    });
    await refresh();
    window.location.href = '/app/dashboard';
    return res;
  };

  const startGoogleSso = async () => {
    setError('');
    setLoading(true);
    try {
      if (IS_DEV_MODE) {
        setSsoEmail(email);
        setStep('2fa');
        setMode2fa('webauthn');
        setLoading(false);
        return;
      }
      await initiateLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!staff) {
      setError(t('login.noStaffMatch'));
      return;
    }
    if (password.length < 6) {
      setError(t('login.passwordRequired'));
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep('2fa');
      setMode2fa('totp');
    }, 300);
  };

  const tryWebAuthn = async () => {
    setError('');
    setWaState('prompting');
    setTimeout(async () => {
      setWaState('ok');
      try {
        await devLogin(activeEmail);
      } catch (err) {
        setWaState('error');
        setError(err instanceof Error ? err.message : 'Login failed');
      }
    }, 700);
  };

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.length !== 6) {
      setError(t('signing.otpSubtitle'));
      return;
    }
    setLoading(true);
    try {
      await devLogin(activeEmail);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const quickLogin = async (loginEmail: string) => {
    setError('');
    try {
      await devLogin(loginEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <div className="login-root">
      <div className="login-shell">
        <div className="login-left">
          <div className="login-brand">
            <div className="brand-mark" style={{ width: 32, height: 32, borderRadius: 8 }}>
              W
            </div>
            <div>
              <div className="fw-600">Wallet Portal</div>
              <div className="text-xs text-faint">{t('login.custodialSub')}</div>
            </div>
          </div>

          {step === 'sso' && (
            <div className="login-form">
              <h1 className="login-title">{t('login.title')}</h1>
              <p className="login-sub">{t('login.subtitle')}</p>
              <button
                type="button"
                className="btn btn-secondary btn-lg login-google"
                onClick={startGoogleSso}
                disabled={loading}
              >
                <GoogleGlyph size={16} />
                <span>{loading ? t('login.openingGoogle') : t('login.continueGoogle')}</span>
              </button>
              <div className="login-divider">
                <span>{t('login.orEmail')}</span>
              </div>
              <label className="field">
                <span className="field-label">{t('login.workEmailLabel')}</span>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@treasury.io"
                />
              </label>
              {error && <div className="login-err">{error}</div>}
              <button
                type="button"
                className="btn btn-ghost btn-lg"
                onClick={() => setStep('credentials')}
                style={{ justifyContent: 'space-between' }}
              >
                <span>{t('login.continuePassword')}</span>
                <I.ArrowRight size={14} />
              </button>
              <div className="login-note">
                <I.Lock size={11} /> {t('login.auditNote')}
              </div>
            </div>
          )}

          {step === 'credentials' && (
            <form className="login-form" onSubmit={submitCredentials}>
              <button type="button" className="login-back" onClick={() => setStep('sso')}>
                <I.ArrowLeft size={12} /> {t('login.back')}
              </button>
              <h1 className="login-title">{t('login.passwordSignIn')}</h1>
              <p className="login-sub">{t('login.passwordFallback')}</p>
              <label className="field">
                <span className="field-label">{t('login.workEmailLabel')}</span>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              <label className="field">
                <span className="field-label">{t('login.passwordLabel')}</span>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              {error && <div className="login-err">{error}</div>}
              <button type="submit" className="btn btn-accent btn-lg" disabled={loading}>
                {loading ? t('login.checking') : t('login.continue')}
              </button>
            </form>
          )}

          {step === '2fa' && staff && (
            <div className="login-form">
              <button type="button" className="login-back" onClick={() => setStep('sso')}>
                <I.ArrowLeft size={12} /> {t('login.back')}
              </button>
              <h1 className="login-title">{t('login.verifyIdentity')}</h1>
              <p className="login-sub">{t('login.secondFactorRequired')}</p>
              <div className="login-account">
                <div className="avatar sm">{staff.initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="fw-500 text-sm truncate">{staff.name}</div>
                  <div className="text-xs text-muted truncate">{staff.email}</div>
                </div>
                <span className={`role-pill role-${staff.role}`} style={{ marginLeft: 'auto' }}>
                  {ROLE_LABEL[staff.role]}
                </span>
              </div>
              <div className="login-2fa-tabs">
                <button
                  type="button"
                  className={`login-2fa-tab ${mode2fa === 'webauthn' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMode2fa('webauthn');
                    setError('');
                    setWaState('idle');
                  }}
                >
                  <I.Key size={13} /> {t('login.securityKey')}
                </button>
                <button
                  type="button"
                  className={`login-2fa-tab ${mode2fa === 'totp' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMode2fa('totp');
                    setError('');
                  }}
                >
                  <I.Shield size={13} /> {t('login.authenticatorApp')}
                </button>
              </div>
              {mode2fa === 'webauthn' && (
                <div className={`login-webauthn ${waState}`}>
                  <div className="login-webauthn-icon">
                    {waState === 'ok' ? <I.Check size={28} /> : <I.Key size={28} />}
                  </div>
                  <div className="login-webauthn-title">
                    {waState === 'idle' && t('login.touchKey')}
                    {waState === 'prompting' && t('login.waitingDevice')}
                    {waState === 'ok' && t('login.verified')}
                    {waState === 'error' && t('login.authFailed')}
                  </div>
                  <div className="login-webauthn-sub">
                    {/* Keep technical term WebAuthn in English, translate only the trailing phrase */}
                    WebAuthn · resident credential · {t('login.phishingResistant')}
                  </div>
                  {error && <div className="login-err">{error}</div>}
                  <button
                    type="button"
                    className="btn btn-accent btn-lg"
                    onClick={tryWebAuthn}
                    disabled={waState === 'prompting' || waState === 'ok'}
                    style={{ width: '100%' }}
                  >
                    {waState === 'prompting'
                      ? t('login.verifying')
                      : waState === 'ok'
                        ? t('login.signingIn')
                        : t('login.useSecurityKey')}
                  </button>
                  <button
                    type="button"
                    className="login-linkish"
                    onClick={() => setMode2fa('totp')}
                  >
                    {t('login.useAuthApp')}
                  </button>
                </div>
              )}
              {mode2fa === 'totp' && (
                <form onSubmit={submitTotp} className="login-totp">
                  <label className="field">
                    <span className="field-label">{t('login.sixDigitCode')}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="input otp-input"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      // biome-ignore lint/a11y/noAutofocus: focuses OTP input after step transition — matches prototype UX
                      autoFocus
                      placeholder="000000"
                    />
                  </label>
                  {error && <div className="login-err">{error}</div>}
                  <button
                    type="submit"
                    className="btn btn-accent btn-lg"
                    disabled={loading || otp.length !== 6}
                  >
                    {loading ? t('login.verifying') : t('login.signIn')}
                  </button>
                  <div className="login-note">{t('login.totpTip')}</div>
                </form>
              )}
            </div>
          )}
        </div>

        <div className="login-right">
          <div className="login-right-inner">
            <div className="login-side-title">{t('login.demoAccounts')}</div>
            <div className="login-side-sub">{t('login.demoSubtitle')}</div>
            <div className="login-accounts">
              {DEMO_STAFF.map((s) => (
                <button
                  key={s.email}
                  type="button"
                  className="login-account-card"
                  onClick={() => quickLogin(s.email)}
                >
                  <div className="avatar">{s.initials}</div>
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <div className="fw-500 text-sm truncate">{s.name}</div>
                    <div className="text-xs text-muted truncate">{s.email}</div>
                  </div>
                  <span className={`role-pill role-${s.role}`}>{ROLE_LABEL[s.role]}</span>
                </button>
              ))}
            </div>
            <div className="login-policy">
              <div className="login-policy-title">
                <I.Shield size={12} /> {t('login.accessApprovals')}
              </div>
              <ul className="login-policy-body">
                <li>
                  {/* Keep "Google Workspace" and "OIDC" as technical terms */}
                  Identity via <b>Google Workspace</b> (OIDC).
                </li>
                <li>
                  {/* Keep "WebAuthn" and "TOTP" as technical terms */}
                  <b>WebAuthn</b> or TOTP required at sign-in.
                </li>
                <li>
                  Every outbound transfer needs{' '}
                  <b>
                    {POLICY_REQUIRED} of {POLICY_TOTAL}
                  </b>{' '}
                  Treasurer co-signatures before it hits chain.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
