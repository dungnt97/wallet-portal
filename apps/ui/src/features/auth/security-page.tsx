import { api } from '@/api/client';
import { LoginHistory } from '@/features/security/login-history';
import { cn } from '@/lib/utils';
import { startRegistration } from '@simplewebauthn/browser';
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
// /app/account/security — manage WebAuthn credentials + login history
// MVP: single "Add security key" button that runs the registration ceremony.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function SecurityPage() {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [deviceName, setDeviceName] = useState('My Security Key');

  async function handleAddKey() {
    setState('pending');
    setErrorMsg('');
    try {
      // Step 1 — fetch attestation options from server
      const options = await api.post<Record<string, unknown>>('/auth/webauthn/register/options', {
        deviceName,
      });

      // Step 2 — browser registration ceremony
      // @simplewebauthn/browser v10: startRegistration takes optionsJSON directly as first arg
      const registrationResponse = await startRegistration(
        options as unknown as Parameters<typeof startRegistration>[0]
      );

      // Step 3 — verify and persist credential on server
      await api.post('/auth/webauthn/register/verify', registrationResponse);

      setState('success');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? t('auth.registrationCancelled')
            : err.message
          : t('auth.registrationFailed');
      setErrorMsg(msg);
      setState('error');
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--text)]">{t('auth.securityKeys')}</h1>
        <p className="text-[13px] text-[var(--text-muted)] mt-1">
          {t('auth.securityKeysDesc')}
        </p>
      </div>

      <div className="border border-[var(--line)] rounded-xl p-5 space-y-4 bg-[var(--bg-elev)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center flex-shrink-0">
            <KeyRound size={16} />
          </div>
          <div>
            <div className="text-[13px] font-medium text-[var(--text)]">
              {t('auth.addSecurityKey')}
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {/* Keep FIDO2, YubiKey as technical terms */}
              {t('auth.fido2Hint')}
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="device-name"
            className="block text-[12px] font-medium text-[var(--text-muted)] mb-1"
          >
            {t('auth.deviceName')}
          </label>
          <input
            id="device-name"
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            maxLength={100}
            placeholder={t('auth.deviceNamePlaceholder')}
            disabled={state === 'pending'}
            className={cn(
              'w-full px-3 py-2 rounded-md border text-[13px] bg-[var(--bg)] text-[var(--text)]',
              'border-[var(--line)] focus:border-[var(--accent)] focus:outline-none transition-colors',
              'placeholder:text-[var(--text-faint)] disabled:opacity-50'
            )}
          />
        </div>

        {errorMsg && (
          <div className="text-[12px] text-[var(--err-text)] bg-[var(--err-soft)] px-3 py-2 rounded-md">
            {errorMsg}
          </div>
        )}

        {state === 'success' ? (
          <div className="flex items-center gap-2 text-[13px] text-[var(--success-text)] bg-[var(--success-soft)] px-3 py-2 rounded-md">
            <CheckCircle2 size={14} />
            {t('auth.keyRegisteredSuccess')}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleAddKey}
            disabled={state === 'pending'}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium transition-colors',
              'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {state === 'pending' ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {t('auth.followBrowserPrompt')}
              </>
            ) : (
              <>
                <ShieldCheck size={14} />
                {t('auth.addSecurityKey')}
              </>
            )}
          </button>
        )}
      </div>

      {/* Login history — real data from /staff/me/sessions */}
      <LoginHistory />
    </div>
  );
}
