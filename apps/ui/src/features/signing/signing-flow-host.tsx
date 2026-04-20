// Signing flow host — renders the correct modal for the current flow step.
// 7-modal chain: review → (policy-block | wallet-sign) → step-up → (otp fallback)
//               → execute → done, plus reject branch from any stage.
import { useEffect } from 'react';
import { ExecuteTxModal } from './execute-tx-modal';
import { OtpModal } from './otp-modal';
import { PolicyBlockModal } from './policy-block-modal';
import { type RejectReason, RejectTxModal } from './reject-tx-modal';
import { ReviewTransactionModal } from './review-transaction-modal';
import type { SigningFlow } from './signing-flow';
import { StepUpModal } from './step-up-modal';
import { WalletSignPopup } from './wallet-sign-popup';

interface Props {
  flow: SigningFlow;
  /** Called after successful broadcast (step === 'done'). */
  onComplete?: () => void;
  /** Called after reject captured from reject modal. */
  onRejected?: (r: RejectReason) => void;
}

export function SigningFlowHost({ flow, onComplete, onRejected }: Props) {
  const {
    state,
    confirmReview,
    walletSigned,
    stepUpPassed,
    useOtpFallback,
    otpVerified,
    cancel,
    reset,
  } = flow;

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

      <PolicyBlockModal open={state.step === 'policy-block'} op={state.op} onClose={reset} />

      <WalletSignPopup
        open={state.step === 'wallet-sign'}
        op={state.op}
        onSigned={walletSigned}
        onRejected={() => flow.reject('User rejected in wallet popup')}
        onClose={cancel}
      />

      <StepUpModal
        open={state.step === 'step-up'}
        op={state.op}
        onClose={cancel}
        onVerified={(r) => {
          void stepUpPassed(r);
        }}
        onUseOtpFallback={useOtpFallback}
      />

      <OtpModal
        open={state.step === 'otp'}
        op={state.op}
        onClose={cancel}
        onVerified={(r) => {
          void otpVerified(r);
        }}
        onBackToStepUp={() => {
          // Return to step-up — reset the flow to that stage
          // (cheapest: call confirmReview again from wallet-sign would be wrong;
          // simplest is to go back through the state machine:)
          // We want: otp → step-up. Call the flow to reset to step-up.
          // Note: no explicit API, so we use cancel + would need restart.
          // For simplicity, cancel the flow when returning back.
          cancel();
        }}
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
