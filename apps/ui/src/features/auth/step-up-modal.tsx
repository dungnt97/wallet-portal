import { cn } from '@/lib/utils';
import { Loader2, ShieldCheck, X } from 'lucide-react';
// StepUpModal — prompts the user to verify with their security key / passkey
// Opened by StepUpProvider when an API call returns 403 STEP_UP_REQUIRED.
// On success: resolves the pending promise so the original request is retried.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStepUp } from './use-step-up';

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export function StepUpModal({ onSuccess, onCancel }: Props) {
  const { t } = useTranslation();
  const { runStepUp } = useStepUp();
  const [state, setState] = useState<'idle' | 'pending' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleVerify() {
    setState('pending');
    setErrorMsg('');
    try {
      await runStepUp();
      setState('idle');
      onSuccess();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? t('auth.verificationCancelled')
            : err.message
          : t('auth.verificationFailed');
      setErrorMsg(msg);
      setState('error');
    }
  }

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className={cn(
          'relative w-full max-w-sm mx-4 rounded-xl border border-[var(--line)]',
          'bg-[var(--bg-elev)] shadow-xl p-6 space-y-5'
        )}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-3 right-3 p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-muted)] transition-colors"
          aria-label={t('common.cancel')}
        >
          <X size={14} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-[var(--text)]">
              {t('auth.stepUpTitle')}
            </div>
            <div className="text-[12px] text-[var(--text-muted)]">
              {t('auth.stepUpDesc')}
            </div>
          </div>
        </div>

        {/* Body */}
        <p className="text-[13px] text-[var(--text-muted)]">
          {t('auth.stepUpBody')}
        </p>

        {errorMsg && (
          <div className="text-[12px] text-[var(--err-text)] bg-[var(--err-soft)] px-3 py-2 rounded-md">
            {errorMsg}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 rounded-md text-[13px] font-medium border border-[var(--line)] text-[var(--text-muted)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleVerify}
            disabled={state === 'pending'}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-[13px] font-medium',
              'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {state === 'pending' && <Loader2 size={14} className="animate-spin" />}
            {state === 'pending' ? t('auth.waitingForKey') : t('auth.verifyWithKey')}
          </button>
        </div>
      </div>
    </div>
  );
}
