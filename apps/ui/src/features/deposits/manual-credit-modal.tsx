// manual-credit-modal — admin-only override: bypass on-chain deposit flow.
// POST /deposits/manual-credit requires admin role + WebAuthn step-up
// (step-up is handled transparently by the API client interceptor).
import { api } from '@/api/client';
import { Modal } from '@/components/overlays/modal';
import { useToast } from '@/components/overlays/toast-host';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ManualCreditBody {
  userId: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: string;
  reason: string;
}

interface ManualCreditResult {
  depositId: string;
  userId: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: string;
  creditedBy: string;
  createdAt: string;
}

function useManualCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ManualCreditBody) =>
      api.post<ManualCreditResult>('/deposits/manual-credit', body),
    onSuccess: () => {
      // Refresh deposits list so the new manual row appears immediately
      void qc.invalidateQueries({ queryKey: ['deposits'] });
    },
  });
}

export function ManualCreditModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  const [userId, setUserId] = useState('');
  const [chain, setChain] = useState<'bnb' | 'sol'>('bnb');
  const [token, setToken] = useState<'USDT' | 'USDC'>('USDT');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useManualCredit();

  const isValid =
    userId.trim().length > 0 &&
    /^\d+(\.\d+)?$/.test(amount) &&
    Number.parseFloat(amount) > 0 &&
    reason.trim().length >= 20;

  const handleClose = () => {
    setUserId('');
    setChain('bnb');
    setToken('USDT');
    setAmount('');
    setReason('');
    onClose();
  };

  const handleSubmit = () => {
    mutation.mutate(
      { userId: userId.trim(), chain, token, amount, reason: reason.trim() },
      {
        onSuccess: () => {
          toast(t('deposits.manualCredit.success'), 'success');
          handleClose();
        },
        onError: (err) => {
          toast((err as Error).message ?? t('common.error'), 'error');
        },
      }
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('deposits.manualCredit.title')}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={handleClose}>
            {t('common.cancel')}
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn btn-accent"
            onClick={handleSubmit}
            disabled={mutation.isPending || !isValid}
          >
            {mutation.isPending ? t('common.saving') : t('deposits.manualCredit.submit')}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {/* Warning banner */}
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--warn-soft)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--warn-text)',
          }}
        >
          This action bypasses the block watcher. The credit is applied immediately and is
          irreversible. A critical audit entry will be created.
        </div>

        <label className="field" htmlFor="mc-user-id">
          <span className="field-label">{t('deposits.manualCredit.userSearch')}</span>
          <input
            id="mc-user-id"
            className="input"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="user UUID"
            autoComplete="off"
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label className="field" htmlFor="mc-chain">
            <span className="field-label">{t('deposits.manualCredit.chain')}</span>
            <select
              id="mc-chain"
              className="input"
              value={chain}
              onChange={(e) => setChain(e.target.value as 'bnb' | 'sol')}
            >
              <option value="bnb">BNB Chain</option>
              <option value="sol">Solana</option>
            </select>
          </label>

          <label className="field" htmlFor="mc-token">
            <span className="field-label">{t('deposits.manualCredit.token')}</span>
            <select
              id="mc-token"
              className="input"
              value={token}
              onChange={(e) => setToken(e.target.value as 'USDT' | 'USDC')}
            >
              <option value="USDT">USDT</option>
              <option value="USDC">USDC</option>
            </select>
          </label>
        </div>

        <label className="field" htmlFor="mc-amount">
          <span className="field-label">{t('deposits.manualCredit.amount')}</span>
          <input
            id="mc-amount"
            className="input"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1000.00"
          />
        </label>

        <label className="field" htmlFor="mc-reason">
          <span className="field-label">{t('deposits.manualCredit.reason')}</span>
          <textarea
            id="mc-reason"
            className="input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('deposits.manualCredit.reasonHint')}
            style={{ resize: 'vertical', minHeight: 72 }}
          />
          <span
            className="text-xs"
            style={{ color: reason.trim().length >= 20 ? 'var(--text-muted)' : 'var(--err-text)' }}
          >
            {reason.trim().length}/20 min
          </span>
        </label>

        {mutation.isError && (
          <div
            style={{
              padding: 10,
              background: 'var(--error-soft)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--err-text)',
            }}
          >
            {(mutation.error as Error).message}
          </div>
        )}
      </div>
    </Modal>
  );
}
