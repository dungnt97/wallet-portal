// Login page — fixture email login (P06 replaces with Google OIDC + WebAuthn)
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, Shield } from 'lucide-react';
import { useAuth } from '@/auth/use-auth';
import { FIXTURE_STAFF, ROLES, MULTISIG_POLICY } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/app/dashboard';

  const [email, setEmail] = useState('mira@treasury.io');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  async function quickLogin(staffEmail: string) {
    setError('');
    try {
      await login(staffEmail);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
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
            <h1 className="text-[22px] font-semibold text-[var(--text)]">{t('login.title')}</h1>
            <p className="text-[13px] text-[var(--text-muted)] mt-1">{t('login.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1">
                {t('login.workEmail')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@treasury.io"
                className={cn(
                  'w-full px-3 py-2 rounded-md border text-[13px] bg-[var(--bg-elev)] text-[var(--text)]',
                  'border-[var(--line)] focus:border-[var(--accent)] focus:outline-none transition-colors',
                  'placeholder:text-[var(--text-faint)]',
                )}
              />
            </div>

            {error && (
              <div className="text-[12px] text-[var(--err-text)] bg-[var(--err-soft)] px-3 py-2 rounded-md">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className={cn(
                'w-full py-2.5 rounded-md text-[13px] font-medium transition-colors',
                'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {loading ? t('common.loading') : t('login.continuePassword')}
            </button>
          </form>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-faint)]">
            <Lock size={11} />
            {t('login.auditNote')}
          </div>
        </div>
      </div>

      {/* Right panel — demo accounts */}
      <div className="hidden lg:flex w-80 flex-col bg-[var(--bg-muted)] border-l border-[var(--line)] p-6 gap-4">
        <div>
          <div className="text-[13px] font-semibold text-[var(--text)]">{t('login.demoAccounts')}</div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{t('login.demoSubtitle')}</div>
        </div>

        <div className="space-y-2">
          {FIXTURE_STAFF.filter((s) => s.active).map((s) => (
            <button
              key={s.id}
              onClick={() => quickLogin(s.email)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--line)]',
                'bg-[var(--bg-elev)] hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] transition-colors',
                'text-left',
              )}
            >
              <div className="w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
                {s.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-[var(--text)] truncate">{s.name}</div>
                <div className="text-[10px] text-[var(--text-muted)] truncate">{s.email}</div>
              </div>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex-shrink-0">
                {ROLES[s.role]?.label}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-auto border border-[var(--line)] rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text)]">
            <Shield size={11} />
            Access &amp; approvals
          </div>
          <ul className="text-[11px] text-[var(--text-muted)] space-y-1 list-disc list-inside">
            <li>Identity via <strong>Google Workspace</strong> (OIDC).</li>
            <li><strong>WebAuthn</strong> or TOTP required at sign-in.</li>
            <li>Outbound transfers need <strong>{MULTISIG_POLICY.required}/{MULTISIG_POLICY.total}</strong> Treasurer co-signatures.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
