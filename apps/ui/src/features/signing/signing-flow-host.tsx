import { ConnectWalletModal } from '@/shell/connect-wallet-modal';
// Signing flow host — renders the correct modal for the current flow step.
// 7-modal chain: review → (policy-block | wallet-sign) → step-up → (otp fallback)
//               → execute → done, plus reject branch from any stage.
// Phase 06: passes real-adapter callbacks + ConnectWalletModal trigger.
import { useState } from 'react';
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
    broadcastComplete,
    broadcastFailed,
  } = flow;

  const [connectModalOpen, setConnectModalOpen] = useState(false);

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
        onBroadcastComplete={broadcastComplete}
        onBroadcastFailed={broadcastFailed}
        onNeedConnect={() => setConnectModalOpen(true)}
      />

      {/* ConnectWalletModal triggered when wallet missing for the tx chain */}
      <ConnectWalletModal open={connectModalOpen} onClose={() => setConnectModalOpen(false)} />

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
          // Return to step-up: simplest path is to cancel and let user re-initiate.
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
