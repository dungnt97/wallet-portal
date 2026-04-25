import { ApiError } from '@/api/client';
import { AuthContext } from '@/auth/auth-provider';
// /auth/callback — landing page after Google OIDC consent
// Reads ?ok=1 (success) or ?error=... from the query string.
// On success: calls /auth/me to hydrate AuthContext, then navigates to dashboard.
// On error: shows message and redirects to /login.
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function AuthCallbackPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const authCtx = useContext(AuthContext);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot mount-effect; reading search params deliberately untracked
  useEffect(() => {
    const ok = params.get('ok');
    const error = params.get('error');

    if (error || !ok) {
      setErrorMsg(error ?? t('auth.authFailed'));
      setStatus('error');
      setTimeout(() => navigate('/login', { replace: true }), 3000);
      return;
    }

    // Hydrate session — server already set the cookie during the callback redirect
    authCtx
      ?.refresh()
      .then(() => {
        const intended = sessionStorage.getItem('wp_intended_path') ?? '/app/dashboard';
        sessionStorage.removeItem('wp_intended_path');
        navigate(intended, { replace: true });
      })
      .catch((err) => {
        const msg =
          err instanceof ApiError
            ? `Auth error ${err.status}`
            : t('auth.sessionValidationFailed');
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
          <div className="text-[var(--text-muted)] text-xs">{t('auth.redirectingToLogin')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="text-[var(--text-muted)] text-sm animate-pulse">{t('auth.signingYouIn')}</div>
    </div>
  );
}
