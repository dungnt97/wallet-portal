import { ApiError } from '@/api/client';
import { useCreateWithdrawal } from '@/api/queries';
// New withdrawal — 2-step form (fields → review). Real POST via useCreateWithdrawal mutation.
// Falls back to optimistic local add when API returns 201.
import { useAuth } from '@/auth/use-auth';
import { Risk, Segmented } from '@/components/custody';
import { Sheet } from '@/components/overlays';
import { I } from '@/icons';
import { CHAINS, MULTISIG_POLICY } from '@/lib/constants';
import { fmtUSD, shortHash } from '@/lib/format';
import { useTweaksStore } from '@/stores/tweaks-store';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TOTAL_BALANCES } from '../_shared/fixtures';
import type { FixWithdrawal } from '../_shared/fixtures';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with a locally-shaped withdrawal when the server confirms creation. */
  onSubmit: (w: FixWithdrawal) => void;
}

export function NewWithdrawalForm({ open, onClose, onSubmit }: Props) {
  const { staff } = useAuth();
  const { t } = useTranslation();
  const showRiskFlags = useTweaksStore((s) => s.showRiskFlags);
  const [chain, setChain] = useState<'bnb' | 'sol'>('bnb');
  const [token, setToken] = useState<'USDT' | 'USDC'>('USDT');
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [apiError, setApiError] = useState<string | null>(null);

  const createMutation = useCreateWithdrawal();
  const resetMutation = createMutation.reset;

  useEffect(() => {
    if (open) {
      setStep(1);
      setAmount('');
      setDestination('');
      setNote('');
      setApiError(null);
      resetMutation();
    }
  }, [open, resetMutation]);

  const valid = amount && destination && Number(amount) > 0;
  const riskScore: 'low' | 'med' | null =
    destination.length > 30 && destination.startsWith('0x4')
      ? 'med'
      : destination.length > 0
        ? 'low'
        : null;

  const submit = async () => {
    if (!staff) return;
    setApiError(null);

    try {
      const result = await createMutation.mutateAsync({
        userId: staff.id,
        chain,
        token,
        amount,
        destinationAddr: destination,
        sourceTier: 'hot',
      });

      // Shape server response into the FixWithdrawal type the page expects
      const serverWithdrawal = result.withdrawal as Record<string, unknown>;
      onSubmit({
        id: String(serverWithdrawal.id ?? `wd_${Math.random().toString(36).slice(2)}`),
        chain,
        token,
        amount: Number(amount),
        destination,
        stage: 'awaiting_signatures',
        risk: riskScore || 'low',
        createdAt: String(serverWithdrawal.createdAt ?? new Date().toISOString()),
        requestedBy: staff.id,
        multisig: {
          required: MULTISIG_POLICY.required,
          total: MULTISIG_POLICY.total,
          collected: 0,
          approvers: [],
          rejectedBy: null,
        },
        txHash: null,
        note: note || null,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        // 403 = policy rejected — surface reasons
        const msg = err.message;
        setApiError(
          err.code === 'POLICY_REJECTED'
            ? t('withdrawals.policyBlocked', { msg })
            : t('withdrawals.createError', { msg })
        );
      } else {
        setApiError(t('withdrawals.createError', { msg: String(err) }));
      }
    }
  };

  const isPending = createMutation.isPending;

  const footer =
    step === 1 ? (
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={isPending}>
          {t('withdrawals.cancel')}
        </button>
        <div className="spacer" />
        <button className="btn btn-accent" onClick={() => setStep(2)} disabled={!valid}>
          {t('withdrawals.reviewBtn')}
        </button>
      </>
    ) : (
      <>
        <button className="btn btn-ghost" onClick={() => setStep(1)} disabled={isPending}>
          <I.ChevronLeft size={12} /> {t('withdrawals.back')}
        </button>
        <div className="spacer" />
        <button className="btn btn-accent" onClick={submit} disabled={isPending}>
          {isPending ? '…' : t('withdrawals.submitToMultisig')}
        </button>
      </>
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('withdrawals.newTitle')}
      subtitle={t('withdrawals.newSub', {
        n: MULTISIG_POLICY.required,
        m: MULTISIG_POLICY.total,
      })}
      footer={footer}
    >
      {apiError && (
        <div className="alert err" style={{ marginBottom: 12 }}>
          <I.AlertTri size={14} className="alert-icon" />
          <div className="alert-body">
            <div className="alert-text">{apiError}</div>
          </div>
        </div>
      )}

      {step === 1 ? (
        <>
          <div className="field">
            <span className="field-label">{t('withdrawals.fldChain')}</span>
            <Segmented
              options={[
                { value: 'bnb', label: 'BNB Chain' },
                { value: 'sol', label: 'Solana' },
              ]}
              value={chain}
              onChange={(v) => setChain(v)}
            />
          </div>
          <div className="field">
            <span className="field-label">{t('withdrawals.fldAsset')}</span>
            <Segmented
              options={[
                { value: 'USDT', label: 'USDT' },
                { value: 'USDC', label: 'USDC' },
              ]}
              value={token}
              onChange={(v) => setToken(v)}
            />
          </div>
          <div className="field">
            <label htmlFor="wd-amount" className="field-label">
              {t('withdrawals.fldAmount')}{' '}
              <span className="text-faint text-xs">
                {t('withdrawals.treasuryBal')} ${fmtUSD(TOTAL_BALANCES[chain][token])}
              </span>
            </label>
            <div className="input-prefix">
              <span className="prefix">$</span>
              <input
                id="wd-amount"
                className="input mono"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button
                className="input-suffix-btn"
                onClick={() => setAmount(String(TOTAL_BALANCES[chain][token]))}
              >
                MAX
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="wd-destination" className="field-label">
              {t('withdrawals.fldDest')}
            </label>
            <input
              id="wd-destination"
              className="input mono"
              placeholder={chain === 'bnb' ? '0x…' : 'Solana address'}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
            {showRiskFlags && riskScore && (
              <div
                className="field-hint hstack"
                style={{ justifyContent: 'space-between', marginTop: 6 }}
              >
                <span>
                  {t('withdrawals.addrRisk')} <Risk level={riskScore} />
                </span>
                <span className="text-faint">
                  {riskScore === 'low' ? t('withdrawals.addrSeen') : t('withdrawals.addrUnseen')}
                </span>
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="wd-memo" className="field-label">
              {t('withdrawals.fldMemo')}{' '}
              <span className="text-faint">{t('withdrawals.fldMemoHint')}</span>
            </label>
            <textarea
              id="wd-memo"
              className="textarea"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('withdrawals.memoPh')}
            />
          </div>
        </>
      ) : (
        <>
          <div className="card" style={{ background: 'var(--bg-sunken)', marginBottom: 16 }}>
            <div style={{ padding: 16 }}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtUSD(amount)} <span className="text-muted text-sm fw-500">{token}</span>
              </div>
              <div className="text-xs text-muted" style={{ marginTop: 6 }}>
                to {CHAINS[chain].name} →{' '}
                <span className="text-mono">{shortHash(destination, 8, 6)}</span>
              </div>
            </div>
          </div>
          <dl className="dl">
            <dt>{t('withdrawals.reviewVault')}</dt>
            <dd>{chain === 'bnb' ? t('withdrawals.vaultBsc') : t('withdrawals.vaultSol')}</dd>
            <dt>{t('withdrawals.reviewSigs')}</dt>
            <dd>
              {MULTISIG_POLICY.required} of {MULTISIG_POLICY.total} treasurers
            </dd>
            <dt>{t('withdrawals.reviewFee')}</dt>
            <dd className="text-mono">{chain === 'bnb' ? '~0.0014 BNB' : '~0.000006 SOL'}</dd>
          </dl>
          <div className="alert warn" style={{ marginTop: 16 }}>
            <I.AlertTri size={14} className="alert-icon" />
            <div className="alert-body">
              <div className="alert-title">{t('withdrawals.treasurersNotified')}</div>
              <div className="alert-text">{t('withdrawals.treasurersNotifiedText')}</div>
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}
