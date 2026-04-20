import { useStepUpContext } from '@/auth/step-up-provider';
// Signing flow host — renders the right modal for the current flow step.
// Step-up is delegated to existing StepUpProvider (auth-aware WebAuthn).
import { useEffect } from 'react';
import { ExecuteTxModal } from './execute-tx-modal';
import { type RejectReason, RejectTxModal } from './reject-tx-modal';
import { ReviewTransactionModal } from './review-transaction-modal';
import type { SigningFlow } from './signing-flow';
import { WalletSignPopup } from './wallet-sign-popup';

interface Props {
  flow: SigningFlow;
  /** Called after successful broadcast (step === 'done'). */
  onComplete?: () => void;
  /** Called after reject captured from reject modal. */
  onRejected?: (r: RejectReason) => void;
}

export function SigningFlowHost({ flow, onComplete, onRejected }: Props) {
  const { state, confirmReview, walletSigned, stepUpPassed, cancel, reset } = flow;
  const stepUp = useStepUpContext();

  // When flow transitions to step-up, request WebAuthn from the global provider.
  useEffect(() => {
    if (state.step !== 'step-up') return;
    let cancelled = false;
    stepUp
      .requestStepUp()
      .then(() => {
        if (!cancelled) void stepUpPassed();
      })
      .catch(() => {
        if (!cancelled) cancel();
      });
    return () => {
      cancelled = true;
    };
  }, [state.step, stepUp, stepUpPassed, cancel]);

  // When the broadcast lands, notify parent once.
  useEffect(() => {
    if (state.step === 'done') onComplete?.();
  }, [state.step, onComplete]);

  return (
    <>
      <ReviewTransactionModal
        open={state.step === 'review'}
        op={state.op}
        onClose={cancel}
        onConfirm={confirmReview}
        onReject={() => flow.reject('User rejected on review')}
      />
      <WalletSignPopup
        open={state.step === 'wallet-sign'}
        op={state.op}
        onSigned={walletSigned}
        onRejected={() => flow.reject('User rejected in wallet popup')}
        onClose={cancel}
      />
      <ExecuteTxModal
        open={state.step === 'execute' || state.step === 'done'}
        op={state.op}
        broadcast={state.broadcast}
        onClose={() => {
          reset();
        }}
      />
      <RejectTxModal
        open={state.step === 'rejected'}
        op={state.op}
        onClose={reset}
        onRejected={(r) => {
          onRejected?.(r);
          reset();
        }}
      />
    </>
  );
}
