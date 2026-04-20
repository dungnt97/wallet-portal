// Withdrawal action handlers — extracted from `withdrawals-page.tsx` to keep
// the page under 200 LOC and give the stubbed approval / reject / execute /
// signing wiring a single owner. Consumes TanStack Query + SigningFlow +
// local overrides. Returns stable callbacks + derived state.
import { useAuth } from '@/auth/use-auth';
import { useToast } from '@/components/overlays';
import { useMemo, useState } from 'react';
import type { FixWithdrawal } from '../_shared/fixtures';
import { type useSigningFlow, withdrawalToOp } from '../signing';
import { useWithdrawals } from './use-withdrawals';

type SigningFlow = ReturnType<typeof useSigningFlow>;

export interface WithdrawalActions {
  /** Unified withdrawal list (server data + local optimistic overrides). */
  list: FixWithdrawal[];
  /** Currently-selected row for the detail sheet. */
  selected: FixWithdrawal | null;
  setSelected: (w: FixWithdrawal | null) => void;
  /** Handlers for the detail sheet / sign flow host. */
  onApprove: (w: FixWithdrawal) => void;
  onReject: (w: FixWithdrawal) => void;
  onExecute: (w: FixWithdrawal) => void;
  onSubmitDraft: (w: FixWithdrawal) => void;
  onNewSubmit: (w: FixWithdrawal) => void;
  onSigningComplete: () => void;
  onSigningRejected: () => void;
}

/**
 * Encapsulates the stubbed withdrawal lifecycle: optimistic overrides,
 * signing flow co-ordination, toast messaging. Page stays declarative.
 */
export function useWithdrawalActions(
  signingFlow: SigningFlow,
  onCreated: () => void
): WithdrawalActions {
  const { staff } = useAuth();
  const toast = useToast();
  const { data } = useWithdrawals();

  const [selected, setSelected] = useState<FixWithdrawal | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, FixWithdrawal>>({});
  const [pendingSignWithdrawal, setPendingSignWithdrawal] = useState<FixWithdrawal | null>(null);

  const list: FixWithdrawal[] = useMemo(() => {
    const base = data ?? [];
    return base.map((w) => localOverrides[w.id] ?? w);
  }, [data, localOverrides]);

  const addOverride = (w: FixWithdrawal) => setLocalOverrides((prev) => ({ ...prev, [w.id]: w }));

  const onApprove = (w: FixWithdrawal) => {
    if (!staff) return;
    setPendingSignWithdrawal(w);
    signingFlow.start(withdrawalToOp(w));
  };

  const onSigningComplete = () => {
    const w = pendingSignWithdrawal;
    if (!w || !staff) return;
    const nextCount = w.multisig.collected + 1;
    const threshold = nextCount >= w.multisig.required;
    const updated: FixWithdrawal = {
      ...w,
      stage: threshold ? 'completed' : 'awaiting_signatures',
      multisig: {
        ...w.multisig,
        collected: nextCount,
        approvers: [
          ...w.multisig.approvers,
          {
            staffId: staff.id,
            at: new Date().toISOString(),
            txSig: signingFlow.state.signature?.signature.slice(0, 12) ?? 'sig…',
          },
        ],
      },
      txHash: threshold ? (signingFlow.state.broadcast?.hash ?? w.txHash) : w.txHash,
    };
    addOverride(updated);
    setSelected(updated);
    setPendingSignWithdrawal(null);
    toast(
      threshold ? `${w.id} signed and broadcast on-chain.` : `${w.id} co-signature recorded.`,
      'success'
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
    toast(`Rejected ${w.id}.`, 'success');
  };

  const onReject = (w: FixWithdrawal) => {
    if (!staff) return;
    const updated: FixWithdrawal = {
      ...w,
      stage: 'failed',
      multisig: { ...w.multisig, rejectedBy: staff.id },
    };
    addOverride(updated);
    setSelected(updated);
    toast(`Rejected ${w.id}.`, 'success');
  };

  const onExecute = (w: FixWithdrawal) => {
    const updated: FixWithdrawal = { ...w, stage: 'completed', txHash: `stub_${w.id}` };
    addOverride(updated);
    setSelected(updated);
  };

  const onSubmitDraft = (w: FixWithdrawal) => {
    const updated: FixWithdrawal = { ...w, stage: 'awaiting_signatures' };
    addOverride(updated);
    setSelected(updated);
    toast(`${w.id} submitted to multisig.`, 'success');
  };

  const onNewSubmit = (w: FixWithdrawal) => {
    addOverride(w);
    onCreated();
    toast(`Created ${w.id}.`, 'success');
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
