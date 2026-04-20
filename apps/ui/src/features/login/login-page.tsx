// Login page — Google Workspace SSO only (P06 OIDC flow)
// Clicking the button calls POST /auth/session/initiate and redirects to Google.
import { useState } from 'react';
import { Lock, Shield } from 'lucide-react';
import { useAuth } from '@/auth/use-auth';
import { cn } from '@/lib/utils';

export function LoginPage() {
  const { initiateLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    try {
      await initiateLogin();
      // browser will redirect away — no state update needed
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login initiation failed.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      {/* Left panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center font-bold text-base">
              W
            </div>
            <div>
              <div className="text-[15px] font-semibold text-[var(--text)]">Wallet Portal</div>
              <div className="text-[11px] text-[var(--text-faint)]">Custodial Treasury · Staff console</div>
            </div>
          </div>

          <div>
            <h1 className="text-[22px] font-semibold text-[var(--text)]">Sign in</h1>
            <p className="text-[13px] text-[var(--text-muted)] mt-1">
              Use your Google Workspace account to access the portal.
            </p>
          </div>

          {error && (
            <div className="text-[12px] text-[var(--err-text)] bg-[var(--err-soft)] px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          {/* Google SSO button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className={cn(
              'w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-md border',
              'border-[var(--line)] bg-[var(--bg-elev)] text-[13px] font-medium text-[var(--text)]',
              'hover:bg-[var(--bg-muted)] hover:border-[var(--accent-line)] transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {/* Google "G" logo SVG */}
            {!loading && (
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="none" d="M0 0h48v48H0z"/>
              </svg>
            )}
            {loading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-faint)]">
            <Lock size={11} />
            All actions are audit-logged. Credentials verified via Google Workspace OIDC.
          </div>
        </div>
      </div>

      {/* Right panel — security info */}
      <div className="hidden lg:flex w-80 flex-col bg-[var(--bg-muted)] border-l border-[var(--line)] p-6 gap-4">
        <div>
          <div className="text-[13px] font-semibold text-[var(--text)]">Access &amp; security</div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">How authentication works</div>
        </div>

        <div className="border border-[var(--line)] rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text)]">
            <Shield size={11} />
            Multi-factor access
          </div>
          <ul className="text-[11px] text-[var(--text-muted)] space-y-1 list-disc list-inside">
            <li>Identity via <strong>Google Workspace</strong> (OIDC).</li>
            <li><strong>WebAuthn</strong> step-up required for write operations.</li>
            <li>Session expires after 24 hours of inactivity.</li>
            <li>Step-up window is 5 minutes per verification.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
