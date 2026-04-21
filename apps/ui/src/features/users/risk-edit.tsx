// risk-edit — admin-only modal to update a user's risk tier.
// PATCH /users/:id/risk requires admin + WebAuthn step-up (handled by API client interceptor).
// User detail header shows coloured risk badge via RiskBadge component.
import { api } from '@/api/client';
import { Modal } from '@/components/overlays/modal';
import { useToast } from '@/components/overlays/toast-host';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type RiskTier = 'low' | 'medium' | 'high' | 'frozen';

interface RiskUpdateBody {
  tier: RiskTier;
  reason: string;
}

interface RiskUpdateResult {
  userId: string;
  riskTier: RiskTier;
  riskReason: string;
  riskUpdatedAt: string;
  riskUpdatedBy: string;
}

// ── Badge ─────────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<RiskTier, string> = {
  low: 'var(--success-text)',
  medium: 'var(--warn-text)',
  high: 'var(--err-text)',
  frozen: 'var(--err-text)',
};

const TIER_BG: Record<RiskTier, string> = {
  low: 'var(--success-soft)',
  medium: 'var(--warn-soft)',
  high: 'var(--error-soft)',
  frozen: 'var(--error-soft)',
};

interface BadgeProps {
  tier: RiskTier;
}

export function RiskBadge({ tier }: BadgeProps) {
  const { t } = useTranslation();
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 600,
        background: TIER_BG[tier],
        color: TIER_COLORS[tier],
      }}
    >
      {tier === 'frozen' ? '🔒' : '●'} {t(`users.riskBadge.${tier}`)}
    </span>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

interface EditProps {
  userId: string;
  currentTier: RiskTier;
  open: boolean;
  onClose: () => void;
}

function useUpdateRisk(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RiskUpdateBody) =>
      api.patch<RiskUpdateResult>(`/users/${userId}/risk`, body),
    onSuccess: () => {
      // Invalidate user detail + list so badge refreshes immediately
      void qc.invalidateQueries({ queryKey: ['user', userId] });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function RiskEditModal({ userId, currentTier, open, onClose }: EditProps) {
  const { t } = useTranslation();
  const toast = useToast();

  const [tier, setTier] = useState<RiskTier>(currentTier);
  const [reason, setReason] = useState('');

  const mutation = useUpdateRisk(userId);

  const handleSave = () => {
    mutation.mutate(
      { tier, reason },
      {
        onSuccess: () => {
          toast(t('users.riskEdit.saved'), 'success');
          setReason('');
          onClose();
        },
        onError: (err) => {
          toast((err as Error).message ?? t('common.error'), 'error');
        },
      }
    );
  };

  const handleClose = () => {
    setTier(currentTier);
    setReason('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('users.riskEdit.title')}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={handleClose}>
            {t('common.cancel')}
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn btn-accent"
            onClick={handleSave}
            disabled={mutation.isPending || !reason.trim()}
          >
            {mutation.isPending ? t('common.saving') : t('users.riskEdit.save')}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <label className="field" htmlFor="risk-tier">
          <span className="field-label">{t('users.riskEdit.tier')}</span>
          <select
            id="risk-tier"
            className="input"
            value={tier}
            onChange={(e) => setTier(e.target.value as RiskTier)}
          >
            <option value="low">{t('users.riskBadge.low')}</option>
            <option value="medium">{t('users.riskBadge.medium')}</option>
            <option value="high">{t('users.riskBadge.high')}</option>
            <option value="frozen">{t('users.riskBadge.frozen')}</option>
          </select>
        </label>

        <label className="field" htmlFor="risk-reason">
          <span className="field-label">{t('users.riskEdit.reason')}</span>
          <textarea
            id="risk-reason"
            className="input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('users.riskEdit.reasonPlaceholder')}
            style={{ resize: 'vertical', minHeight: 72 }}
          />
        </label>

        {tier === 'frozen' && (
          <div
            style={{
              padding: 10,
              background: 'var(--error-soft)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--err-text)',
            }}
          >
            🔒 Freezing this user will block ALL withdrawals immediately via the policy engine.
          </div>
        )}

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
