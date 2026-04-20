import { api } from '@/api/client';
import { useAuth } from '@/auth/use-auth';
import { I } from '@/icons';
// Login page — 1:1 port of prototype `portal/src/page_login.jsx`.
// 3-step flow: `sso` (Google + email input + password fallback entry)
// → `credentials` (email + password form) → `2fa` (WebAuthn key OR TOTP 6-digit).
// Right column lists demo accounts that short-circuit via POST /auth/session/dev-login
// when VITE_AUTH_DEV_MODE=true (backend AUTH_DEV_MODE must also be true).
import { useState } from 'react';
import { GoogleGlyph } from './google-glyph';
import type { DemoStaff, Role, StepMode, TwoFaMode, WaState } from './login-types';
import { DEMO_STAFF, POLICY_REQUIRED, POLICY_TOTAL, ROLE_LABEL } from './login-types';

const IS_DEV_MODE = import.meta.env.VITE_AUTH_DEV_MODE === 'true';

export function LoginPage() {
  const { initiateLogin, refresh } = useAuth();
  const [lang, setLang] = useState<'vi' | 'en'>(
    () => (localStorage.getItem('wp_lang') as 'vi' | 'en') || 'vi'
  );
  const vi = lang === 'vi';
  const [email, setEmail] = useState('mira@treasury.io');
  const [password, setPassword] = useState('••••••••••');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<StepMode>('sso');
  const [mode2fa, setMode2fa] = useState<TwoFaMode>('webauthn');
  const [waState, setWaState] = useState<WaState>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ssoEmail, setSsoEmail] = useState('');
  const toggleLang = () => {
    const next: 'vi' | 'en' = vi ? 'en' : 'vi';
    setLang(next);
    localStorage.setItem('wp_lang', next);
  };

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
      setError(
        vi
          ? 'Không có tài khoản nhân sự khớp với email này.'
          : 'No staff account matches that email.'
      );
      return;
    }
    if (password.length < 6) {
      setError(vi ? 'Cần nhập mật khẩu.' : 'Password is required.');
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
      setError(
        vi
          ? 'Nhập mã 6 chữ số từ ứng dụng authenticator.'
          : 'Enter the 6-digit code from your authenticator.'
      );
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
      <button
        type="button"
        onClick={toggleLang}
        className="btn btn-ghost btn-sm"
        style={{ position: 'absolute', top: 16, right: 16 }}
      >
        {vi ? 'EN' : 'VI'}
      </button>
      <div className="login-shell">
        <div className="login-left">
          <div className="login-brand">
            <div className="brand-mark" style={{ width: 32, height: 32, borderRadius: 8 }}>
              W
            </div>
            <div>
              <div className="fw-600">Wallet Portal</div>
              <div className="text-xs text-faint">Custodial Treasury · Staff console</div>
            </div>
          </div>

          {step === 'sso' && (
            <div className="login-form">
              <h1 className="login-title">{vi ? 'Đăng nhập' : 'Sign in'}</h1>
              <p className="login-sub">
                {vi
                  ? 'Chỉ dành cho nhân sự. Quản lý qua Google Workspace.'
                  : 'Staff access only. Managed through Google Workspace.'}
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-lg login-google"
                onClick={startGoogleSso}
                disabled={loading}
              >
                <GoogleGlyph size={16} />
                <span>
                  {loading
                    ? vi
                      ? 'Đang mở Google…'
                      : 'Opening Google…'
                    : vi
                      ? 'Tiếp tục với Google'
                      : 'Continue with Google'}
                </span>
              </button>
              <div className="login-divider">
                <span>{vi ? 'hoặc dùng email & mật khẩu' : 'or use email & password'}</span>
              </div>
              <label className="field">
                <span className="field-label">{vi ? 'Email công việc' : 'Work email'}</span>
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
                <span>{vi ? 'Tiếp tục với mật khẩu' : 'Continue with password'}</span>
                <I.ArrowRight size={14} />
              </button>
              <div className="login-note">
                <I.Lock size={11} />{' '}
                {vi
                  ? 'Mọi lần đăng nhập và thao tác ghi đều được lưu vào audit log.'
                  : 'Every sign-in and write action is recorded to the audit trail.'}
              </div>
            </div>
          )}

          {step === 'credentials' && (
            <form className="login-form" onSubmit={submitCredentials}>
              <button type="button" className="login-back" onClick={() => setStep('sso')}>
                <I.ArrowLeft size={12} /> {vi ? 'Quay lại' : 'Back'}
              </button>
              <h1 className="login-title">{vi ? 'Đăng nhập bằng mật khẩu' : 'Password sign-in'}</h1>
              <p className="login-sub">
                {vi
                  ? 'Phương án dự phòng. Ưu tiên Google SSO.'
                  : 'Fallback path. Google SSO is preferred.'}
              </p>
              <label className="field">
                <span className="field-label">{vi ? 'Email công việc' : 'Work email'}</span>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              <label className="field">
                <span className="field-label">{vi ? 'Mật khẩu' : 'Password'}</span>
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
                {loading ? (vi ? 'Đang kiểm tra…' : 'Checking…') : vi ? 'Tiếp tục' : 'Continue'}
              </button>
            </form>
          )}

          {step === '2fa' && staff && (
            <div className="login-form">
              <button type="button" className="login-back" onClick={() => setStep('sso')}>
                <I.ArrowLeft size={12} /> {vi ? 'Quay lại' : 'Back'}
              </button>
              <h1 className="login-title">{vi ? 'Xác minh danh tính' : "Verify it's you"}</h1>
              <p className="login-sub">
                {vi
                  ? 'Mọi tài khoản nhân sự đều bắt buộc xác thực 2 yếu tố.'
                  : 'Second factor is required for all staff accounts.'}
              </p>
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
                  <I.Key size={13} /> {vi ? 'Khoá bảo mật' : 'Security key'}
                </button>
                <button
                  type="button"
                  className={`login-2fa-tab ${mode2fa === 'totp' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMode2fa('totp');
                    setError('');
                  }}
                >
                  <I.Shield size={13} /> {vi ? 'Ứng dụng authenticator' : 'Authenticator app'}
                </button>
              </div>
              {mode2fa === 'webauthn' && (
                <div className={`login-webauthn ${waState}`}>
                  <div className="login-webauthn-icon">
                    {waState === 'ok' ? <I.Check size={28} /> : <I.Key size={28} />}
                  </div>
                  <div className="login-webauthn-title">
                    {waState === 'idle' &&
                      (vi
                        ? 'Chạm khoá bảo mật hoặc dùng platform authenticator'
                        : 'Touch your security key or use platform authenticator')}
                    {waState === 'prompting' && (vi ? 'Đang chờ thiết bị…' : 'Waiting for device…')}
                    {waState === 'ok' && (vi ? 'Đã xác minh' : 'Verified')}
                    {waState === 'error' && (vi ? 'Xác thực thất bại' : 'Authentication failed')}
                  </div>
                  <div className="login-webauthn-sub">
                    WebAuthn · resident credential · {vi ? 'chống phishing' : 'phishing-resistant'}
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
                      ? vi
                        ? 'Đang xác minh…'
                        : 'Verifying…'
                      : waState === 'ok'
                        ? vi
                          ? 'Đang đăng nhập…'
                          : 'Signing you in…'
                        : vi
                          ? 'Dùng khoá bảo mật'
                          : 'Use security key'}
                  </button>
                  <button
                    type="button"
                    className="login-linkish"
                    onClick={() => setMode2fa('totp')}
                  >
                    {vi ? 'Dùng ứng dụng authenticator' : 'Use authenticator app instead'}
                  </button>
                </div>
              )}
              {mode2fa === 'totp' && (
                <form onSubmit={submitTotp} className="login-totp">
                  <label className="field">
                    <span className="field-label">{vi ? 'Mã 6 chữ số' : '6-digit code'}</span>
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
                    {loading
                      ? vi
                        ? 'Đang xác minh…'
                        : 'Verifying…'
                      : vi
                        ? 'Đăng nhập'
                        : 'Sign in'}
                  </button>
                  <div className="login-note">
                    {vi
                      ? 'Mẹo: bất kỳ 6 chữ số nào đều dùng được trong bản prototype này.'
                      : 'Tip: any 6 digits work in this prototype.'}
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        <div className="login-right">
          <div className="login-right-inner">
            <div className="login-side-title">{vi ? 'Tài khoản demo' : 'Demo accounts'}</div>
            <div className="login-side-sub">
              {vi
                ? 'Bỏ qua xác thực và vào ngay với một role cụ thể.'
                : 'Skip auth and jump straight in as a specific role.'}
            </div>
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
                <I.Shield size={12} /> {vi ? 'Truy cập & duyệt' : 'Access & approvals'}
              </div>
              <ul className="login-policy-body">
                {vi ? (
                  <>
                    <li>
                      Danh tính qua <b>Google Workspace</b> (OIDC).
                    </li>
                    <li>
                      <b>WebAuthn</b> hoặc TOTP bắt buộc khi đăng nhập.
                    </li>
                    <li>
                      Mọi transfer ra ngoài cần{' '}
                      <b>
                        {POLICY_REQUIRED}/{POLICY_TOTAL}
                      </b>{' '}
                      chữ ký Treasurer trước khi lên chain.
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      Identity via <b>Google Workspace</b> (OIDC).
                    </li>
                    <li>
                      <b>WebAuthn</b> or TOTP required at sign-in.
                    </li>
                    <li>
                      Every outbound transfer needs{' '}
                      <b>
                        {POLICY_REQUIRED} of {POLICY_TOTAL}
                      </b>{' '}
                      Treasurer co-signatures before it hits chain.
                    </li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
