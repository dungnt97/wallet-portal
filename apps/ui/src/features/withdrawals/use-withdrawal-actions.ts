import { ApiError } from '@/api/client';
import {
  useApproveWithdrawal,
  useExecuteWithdrawal,
  useRejectWithdrawal,
  useSubmitWithdrawal,
} from '@/api/queries';
// Withdrawal action handlers — real approve + execute + reject + submit mutations wired to admin-api.
// Signing flow integration: approve click → signing-flow.start → on done POST /approve.
import { useAuth } from '@/auth/use-auth';
import { useToast } from '@/components/overlays';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type useSigningFlow, withdrawalToOp } from '../signing';
import { useWithdrawals } from './use-withdrawals';
import type { WithdrawalRow } from './withdrawal-types';

type SigningFlow = ReturnType<typeof useSigningFlow>;

export interface WithdrawalActions {
  list: WithdrawalRow[];
  selected: WithdrawalRow | null;
  setSelected: (w: WithdrawalRow | null) => void;
  onApprove: (w: WithdrawalRow) => void;
  onReject: (w: WithdrawalRow) => void;
  onExecute: (w: WithdrawalRow) => void;
  onSubmitDraft: (w: WithdrawalRow) => void;
  onNewSubmit: (w: WithdrawalRow) => void;
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

  const [selected, setSelected] = useState<WithdrawalRow | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, WithdrawalRow>>({});
  const [pendingSignWithdrawal, setPendingSignWithdrawal] = useState<WithdrawalRow | null>(null);

  // Mutation hooks — keyed by active withdrawal id
  const approveMutation = useApproveWithdrawal(pendingSignWithdrawal?.id ?? selected?.id ?? 'none');
  const executeMutation = useExecuteWithdrawal(selected?.id ?? 'none');
  const rejectMutation = useRejectWithdrawal(selected?.id ?? 'none');
  const submitMutation = useSubmitWithdrawal(selected?.id ?? 'none');

  const list: WithdrawalRow[] = useMemo(() => {
    const base = data ?? [];
    return base.map((w) => localOverrides[w.id] ?? w);
  }, [data, localOverrides]);

  const addOverride = (w: WithdrawalRow) => setLocalOverrides((prev) => ({ ...prev, [w.id]: w }));

  // ── Approve: start signing flow ──────────────────────────────────────────────
  const onApprove = (w: WithdrawalRow) => {
    if (!staff) return;
    setPendingSignWithdrawal(w);
    signingFlow.start(withdrawalToOp(w));
  };

  // ── After signing completes: POST /withdrawals/:id/approve ───────────────────
  const onSigningComplete = () => {
    const w = pendingSignWithdrawal;
    if (!w || !staff) return;

    const sig = signingFlow.state.signature;
    if (!sig) {
      toast(t('withdrawals.approveError', { msg: 'No signature captured' }), 'error');
      setPendingSignWithdrawal(null);
      return;
    }

    const hw = signingFlow.state.hwAttestation;
    approveMutation.mutate(
      {
        signature: sig.signature,
        signerAddress: sig.signer,
        signedAt: sig.at,
        multisigOpId: w.multisigOpId ?? '',
        chain: w.chain,
        ...(hw ? { attestationBlob: hw.blob, attestationType: hw.type } : {}),
      },
      {
        onSuccess: (result) => {
          const nextCount = result.op.collectedSigs;
          const threshold = result.thresholdMet;
          const updated: WithdrawalRow = {
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
    const updated: WithdrawalRow = {
      ...w,
      stage: 'failed',
      multisig: { ...w.multisig, rejectedBy: staff.id },
    };
    addOverride(updated);
    setSelected(updated);
    toast(t('withdrawals.signatureCancelled'), 'success');
  };

  // ── Reject (without signing) — POST /withdrawals/:id/reject ─────────────────
  const onReject = (w: WithdrawalRow) => {
    if (!staff) return;
    rejectMutation.mutate(
      {},
      {
        onSuccess: () => {
          const updated: WithdrawalRow = {
            ...w,
            stage: 'failed',
            multisig: { ...w.multisig, rejectedBy: staff.id },
          };
          addOverride(updated);
          setSelected(updated);
          toast(`${t('withdrawals.rejectBtn')} ${w.id.slice(0, 12)}`, 'success');
        },
        onError: (err) => {
          const msg = err instanceof ApiError ? err.message : String(err);
          toast(t('withdrawals.approveError', { msg }), 'error');
        },
      }
    );
  };

  // ── Execute: POST /withdrawals/:id/execute ───────────────────────────────────
  const onExecute = (w: WithdrawalRow) => {
    toast(t('withdrawals.executeQueued'), 'success');
    executeMutation.mutate(undefined, {
      onSuccess: () => {
        const updated: WithdrawalRow = { ...w, stage: 'executing' };
        addOverride(updated);
        setSelected(updated);
      },
      onError: (err) => {
        const msg = err instanceof ApiError ? err.message : String(err);
        toast(t('withdrawals.executeError', { msg }), 'error');
      },
    });
  };

  // ── Submit draft — POST /withdrawals/:id/submit ─────────────────────────────
  const onSubmitDraft = (w: WithdrawalRow) => {
    submitMutation.mutate(undefined, {
      onSuccess: () => {
        const updated: WithdrawalRow = { ...w, stage: 'awaiting_signatures' };
        addOverride(updated);
        setSelected(updated);
        toast(t('withdrawals.submitToMultisig'), 'success');
      },
      onError: (err) => {
        const msg = err instanceof ApiError ? err.message : String(err);
        toast(t('withdrawals.approveError', { msg }), 'error');
      },
    });
  };

  // ── New withdrawal created callback ─────────────────────────────────────────
  const onNewSubmit = (w: WithdrawalRow) => {
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
