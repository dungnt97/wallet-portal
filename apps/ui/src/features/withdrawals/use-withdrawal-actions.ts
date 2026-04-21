import { ApiError } from '@/api/client';
import { useApproveWithdrawal, useExecuteWithdrawal } from '@/api/queries';
// Withdrawal action handlers — real approve + execute mutations wired to admin-api.
// Signing flow integration: approve click → signing-flow.start → on done POST /approve.
// Local optimistic overrides remain for instant UI feedback before server round-trip.
import { useAuth } from '@/auth/use-auth';
import { useToast } from '@/components/overlays';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FixWithdrawal } from '../_shared/fixtures';
import { type useSigningFlow, withdrawalToOp } from '../signing';
import { useWithdrawals } from './use-withdrawals';

type SigningFlow = ReturnType<typeof useSigningFlow>;

export interface WithdrawalActions {
  list: FixWithdrawal[];
  selected: FixWithdrawal | null;
  setSelected: (w: FixWithdrawal | null) => void;
  onApprove: (w: FixWithdrawal) => void;
  onReject: (w: FixWithdrawal) => void;
  onExecute: (w: FixWithdrawal) => void;
  onSubmitDraft: (w: FixWithdrawal) => void;
  onNewSubmit: (w: FixWithdrawal) => void;
  onSigningComplete: () => void;
  onSigningRejected: () => void;
}

export function useWithdrawalActions(
  signingFlow: SigningFlow,
  onCreated: () => void
): WithdrawalActions {
  const { staff } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const { data } = useWithdrawals();

  const [selected, setSelected] = useState<FixWithdrawal | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, FixWithdrawal>>({});
  const [pendingSignWithdrawal, setPendingSignWithdrawal] = useState<FixWithdrawal | null>(null);

  // Mutation hooks — keyed by selected withdrawal id; fallback to 'none' when idle
  const approveMutation = useApproveWithdrawal(pendingSignWithdrawal?.id ?? selected?.id ?? 'none');
  const executeMutation = useExecuteWithdrawal(selected?.id ?? 'none');

  const list: FixWithdrawal[] = useMemo(() => {
    const base = data ?? [];
    return base.map((w) => localOverrides[w.id] ?? w);
  }, [data, localOverrides]);

  const addOverride = (w: FixWithdrawal) => setLocalOverrides((prev) => ({ ...prev, [w.id]: w }));

  // ── Approve: start signing flow ───────────────────────────────────────────────
  const onApprove = (w: FixWithdrawal) => {
    if (!staff) return;
    setPendingSignWithdrawal(w);
    signingFlow.start(withdrawalToOp(w));
  };

  // ── After signing completes: POST /withdrawals/:id/approve ────────────────────
  const onSigningComplete = () => {
    const w = pendingSignWithdrawal;
    if (!w || !staff) return;

    const sig = signingFlow.state.signature;
    if (!sig) {
      toast(t('withdrawals.approveError', { msg: 'No signature captured' }), 'error');
      setPendingSignWithdrawal(null);
      return;
    }

    approveMutation.mutate(
      {
        signature: sig.signature,
        signerAddress: sig.signer,
        signedAt: sig.at,
        multisigOpId: w.multisig
          ? String((w as unknown as Record<string, unknown>).multisigOpId ?? '')
          : '',
        chain: w.chain,
      },
      {
        onSuccess: (result) => {
          const nextCount = result.op.collectedSigs;
          const threshold = result.thresholdMet;
          const updated: FixWithdrawal = {
            ...w,
            stage: threshold ? 'executing' : 'awaiting_signatures',
            multisig: {
              ...w.multisig,
              collected: nextCount,
              approvers: [
                ...w.multisig.approvers,
                {
                  staffId: staff.id,
                  at: new Date().toISOString(),
                  txSig: sig.signature.slice(0, 12),
                },
              ],
            },
          };
          addOverride(updated);
          setSelected(updated);
          setPendingSignWithdrawal(null);
          toast(
            threshold
              ? t('withdrawals.approveThreshold', {
                  n: result.op.collectedSigs,
                  m: result.op.requiredSigs,
                })
              : t('withdrawals.approveSuccess', {
                  n: result.op.collectedSigs,
                  m: result.op.requiredSigs,
                }),
            'success'
          );
        },
        onError: (err) => {
          const msg = err instanceof ApiError ? err.message : String(err);
          toast(t('withdrawals.approveError', { msg }), 'error');
          setPendingSignWithdrawal(null);
        },
      }
    );
  };

  const onSigningRejected = () => {
    const w = pendingSignWithdrawal;
    setPendingSignWithdrawal(null);
    if (!w || !staff) return;
    const updated: FixWithdrawal = {
      ...w,
      stage: 'failed',
      multisig: { ...w.multisig, rejectedBy: staff.id },
    };
    addOverride(updated);
    setSelected(updated);
    toast(t('withdrawals.signatureCancelled'), 'success');
  };

  // ── Reject (without signing) ──────────────────────────────────────────────────
  const onReject = (w: FixWithdrawal) => {
    if (!staff) return;
    const updated: FixWithdrawal = {
      ...w,
      stage: 'failed',
      multisig: { ...w.multisig, rejectedBy: staff.id },
    };
    addOverride(updated);
    setSelected(updated);
    toast(`${t('withdrawals.rejectBtn')} ${w.id}`, 'success');
  };

  // ── Execute: POST /withdrawals/:id/execute ────────────────────────────────────
  const onExecute = (w: FixWithdrawal) => {
    toast(t('withdrawals.executeQueued'), 'success');
    executeMutation.mutate(undefined, {
      onSuccess: () => {
        const updated: FixWithdrawal = { ...w, stage: 'executing' };
        addOverride(updated);
        setSelected(updated);
      },
      onError: (err) => {
        const msg = err instanceof ApiError ? err.message : String(err);
        toast(t('withdrawals.executeError', { msg }), 'error');
      },
    });
  };

  // ── Submit draft (pre-multisig local action) ──────────────────────────────────
  const onSubmitDraft = (w: FixWithdrawal) => {
    const updated: FixWithdrawal = { ...w, stage: 'awaiting_signatures' };
    addOverride(updated);
    setSelected(updated);
    toast(t('withdrawals.submitToMultisig'), 'success');
  };

  // ── New withdrawal created callback ──────────────────────────────────────────
  const onNewSubmit = (w: FixWithdrawal) => {
    addOverride(w);
    onCreated();
    toast(t('withdrawals.createSuccess'), 'success');
  };

  return {
    list,
    selected,
    setSelected,
    onApprove,
    onReject,
    onExecute,
    onSubmitDraft,
    onNewSubmit,
    onSigningComplete,
    onSigningRejected,
  };
}
