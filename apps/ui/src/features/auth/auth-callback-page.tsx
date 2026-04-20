// /auth/callback — landing page after Google OIDC consent
// Reads ?ok=1 (success) or ?error=... from the query string.
// On success: calls /auth/me to hydrate AuthContext, then navigates to dashboard.
// On error: shows message and redirects to /login.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '@/auth/auth-provider';
import { api, ApiError } from '@/api/client';
import type { StaffUser } from '@/auth/auth-provider';

export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const authCtx = useContext(AuthContext);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const ok = params.get('ok');
    const error = params.get('error');

    if (error || !ok) {
      setErrorMsg(error ?? 'Authentication failed.');
      setStatus('error');
      setTimeout(() => navigate('/login', { replace: true }), 3000);
      return;
    }

    // Hydrate session — server already set the cookie during the callback redirect
    api
      .get<StaffUser>('/auth/me')
      .then((staff) => {
        // Inject staff into AuthContext via the internal escape hatch
        if (authCtx && '_refreshAuth' in authCtx) {
          (authCtx as unknown as { _refreshAuth: () => Promise<void> })._refreshAuth();
        }
        void staff; // staff used by _refreshAuth
        // Navigate to intended destination (stored before login) or dashboard
        const intended = sessionStorage.getItem('wp_intended_path') ?? '/app/dashboard';
        sessionStorage.removeItem('wp_intended_path');
        navigate(intended, { replace: true });
      })
      .catch((err) => {
        const msg = err instanceof ApiError ? `Auth error ${err.status}` : 'Session validation failed';
        setErrorMsg(msg);
        setStatus('error');
        setTimeout(() => navigate('/login', { replace: true }), 3000);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center space-y-2">
          <div className="text-[var(--err-text)] text-sm font-medium">{errorMsg}</div>
          <div className="text-[var(--text-muted)] text-xs">Redirecting to login…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="text-[var(--text-muted)] text-sm animate-pulse">Signing you in…</div>
    </div>
  );
}
