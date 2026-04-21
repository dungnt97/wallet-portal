// Rebalance modal — POST /rebalance. Chain + direction pre-filled from clicked card.
// WebAuthn step-up is handled transparently by the API client on 403 STEP_UP_REQUIRED.
import { ApiError } from '@/api/client';
import { type RebalanceBody, useRebalance } from '@/api/queries';
import { Sheet, useToast } from '@/components/overlays';
import { I } from '@/icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  chain: 'bnb' | 'sol' | null;
  /** Direction of the rebalance — determines which wallet is source vs destination */
  direction: 'hot→cold' | 'cold→hot';
  onClose: () => void;
}

export function RebalanceModal({ open, chain, direction, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const rebalanceMutation = useRebalance();
  const resetMutation = rebalanceMutation.reset;

  const [token, setToken] = useState<'USDT' | 'USDC'>('USDT');
  const [amount, setAmount] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  // Reset state whenever modal opens
  useEffect(() => {
    if (open) {
      setToken('USDT');
      setAmount('');
      setApiError(null);
      resetMutation();
    }
  }, [open, resetMutation]);

  const valid = chain !== null && amount.length > 0 && Number(amount) > 0;

  const handleSubmit = async () => {
    if (!chain || !valid) return;
    setApiError(null);

    const body: RebalanceBody = {
      chain,
      token,
      // Convert decimal dollar amount → minor string (6 decimal places for USDT/USDC)
      amountMinor: (Number(amount) * 1_000_000).toFixed(0),
      // Map UI direction string to API enum
      direction: direction === 'cold→hot' ? 'cold_to_hot' : 'hot_to_cold',
    };

    try {
      const result = await rebalanceMutation.mutateAsync(body);
      toast(t('rebalance.success', { id: result.withdrawalId.slice(0, 8) }), 'success');
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(
          err.code === 'POLICY_REJECTED'
            ? t('rebalance.policyBlocked', { msg: err.message })
            : t('rebalance.error', { msg: err.message })
        );
      } else {
        setApiError(t('rebalance.error', { msg: String(err) }));
      }
    }
  };

  const isPending = rebalanceMutation.isPending;

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={isPending}>
        {t('common.cancel')}
      </button>
      <div className="spacer" />
      <button
        data-testid="rebalance-submit-btn"
        className="btn btn-accent"
        onClick={handleSubmit}
        disabled={!valid || isPending}
      >
        {isPending ? '…' : t('rebalance.submit')}
      </button>
    </>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('rebalance.title')}
      subtitle={t('rebalance.subtitle')}
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

      {/* Chain display (read-only — set by clicked card) */}
      <div className="field">
        <span className="field-label">{t('rebalance.fldChain')}</span>
        <div className="input" style={{ background: 'var(--bg-sunken)', cursor: 'default' }}>
          {chain === 'bnb' ? 'BNB Chain' : chain === 'sol' ? 'Solana' : '—'}
        </div>
      </div>

      {/* Token selector */}
      <div className="field">
        <span className="field-label">{t('rebalance.fldToken')}</span>
        <div className="hstack" style={{ gap: 8 }}>
          {(['USDT', 'USDC'] as const).map((t_) => (
            <button
              key={t_}
              type="button"
              className={`btn ${token === t_ ? 'btn-accent' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setToken(t_)}
            >
              {t_}
            </button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div className="field">
        <label htmlFor="rebalance-amount" className="field-label">
          {t('rebalance.fldAmount')}
        </label>
        <div className="input-prefix">
          <span className="prefix">$</span>
          <input
            id="rebalance-amount"
            data-testid="rebalance-amount-input"
            className="input mono"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="field-hint">{t('rebalance.amountHint')}</div>
      </div>

      {/* Info banner */}
      <div className="alert info" style={{ marginTop: 8 }}>
        <I.Info size={13} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">{t('rebalance.infoTitle')}</div>
          <div className="alert-text">{t('rebalance.infoBody')}</div>
        </div>
      </div>
    </Sheet>
  );
}
