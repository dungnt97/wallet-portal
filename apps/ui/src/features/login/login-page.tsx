import { useAuth } from '@/auth/use-auth';
import { I } from '@/icons';
import { MULTISIG_POLICY } from '@/lib/constants';
// Login page — branded Google SSO screen.
// Pass 4: ports visual design from prototype page_login.jsx. OIDC flow (P06)
// is preserved — Google button → POST /auth/session/initiate → redirect.
// When AUTH_DEV_MODE=true (VITE_AUTH_DEV_MODE), surfaces demo account
// shortcuts that still round-trip through OIDC initiate.
import { useState } from 'react';
import { GoogleGlyph } from './google-glyph';

const IS_DEV_MODE = import.meta.env.VITE_AUTH_DEV_MODE === 'true';

export function LoginPage() {
  const { initiateLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    try {
      await initiateLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login initiation failed.');
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      <div className="login-shell">
        {/* Left — form */}
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

          <div className="login-form">
            <h1 className="login-title">Sign in</h1>
            <p className="login-sub">Staff access only. Managed through Google Workspace.</p>

            <button
              type="button"
              className="btn btn-secondary btn-lg login-google"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <GoogleGlyph size={16} />
              <span>{loading ? 'Opening Google…' : 'Continue with Google'}</span>
            </button>

            {error && <div className="login-err">{error}</div>}

            {IS_DEV_MODE && (
              <>
                <div className="login-divider">
                  <span>dev-mode shortcut</span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-lg"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  style={{ justifyContent: 'space-between' }}
                >
                  <span>Continue as fixture staff</span>
                  <I.ArrowRight size={14} />
                </button>
              </>
            )}

            <div className="login-note">
              <I.Lock size={11} /> Every sign-in and write action is recorded to the audit trail.
            </div>
          </div>
        </div>

        {/* Right — policy panel */}
        <div className="login-right">
          <div className="login-right-inner">
            <div className="login-side-title">Access &amp; approvals</div>
            <div className="login-side-sub">
              How authentication and multisig signing work in this portal.
            </div>

            <div className="login-policy">
              <div className="login-policy-title">
                <I.Shield size={12} /> Controls
              </div>
              <ul className="login-policy-body">
                <li>
                  Identity via <b>Google Workspace</b> (OIDC). Accounts provisioned/deprovisioned in
                  Workspace.
                </li>
                <li>
                  <b>WebAuthn</b> step-up required for every mutation; 5-minute TTL per
                  verification.
                </li>
                <li>
                  Outbound transfers need{' '}
                  <b>
                    {MULTISIG_POLICY.required} of {MULTISIG_POLICY.total}
                  </b>{' '}
                  Treasurer co-signatures before hitting chain.
                </li>
                <li>Session expires after 24h of inactivity.</li>
              </ul>
            </div>

            <div className="login-policy" style={{ marginTop: 12 }}>
              <div className="login-policy-title">
                <I.Key size={12} /> Who can do what
              </div>
              <ul className="login-policy-body">
                <li>
                  <b>Admin</b> — manages staff, roles, config.
                </li>
                <li>
                  <b>Treasurer</b> — co-signs multisig operations (2/3 required).
                </li>
                <li>
                  <b>Operator</b> — creates withdrawals and sweeps.
                </li>
                <li>
                  <b>Viewer</b> — read-only dashboards and records.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
