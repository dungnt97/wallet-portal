// Signing flow orchestrator — 7-stage state machine mirroring prototype
// signing_modals.jsx. Stages: review → wallet-sign → step-up → execute → done.
// Branches: policy-block (if policy fails at review), reject (any stage),
// otp (fallback from step-up).
// Real adapters used unless VITE_AUTH_DEV_MODE=true (CI / offline demo).
import { useCallback, useState } from 'react';
import type { WithdrawalRow } from '../withdrawals/withdrawal-types';
import { mockSign } from './mock-adapters';
import { evaluatePolicy } from './policy-preview';
import { IS_DEV_MODE, broadcastDevMode, makeBroadcastResult } from './signing-flow-broadcast';
import type {
  BroadcastResult,
  HwAttestation,
  SignedSignature,
  SigningFlowState,
  SigningOp,
  StepUpResult,
} from './signing-flow-types';

// Re-export types for external consumers
export type {
  BroadcastResult,
  HwAttestation,
  SignedSignature,
  SigningFlowState,
  SigningOp,
  SigningStep,
  StepUpResult,
} from './signing-flow-types';

const INITIAL: SigningFlowState = {
  step: 'idle',
  op: null,
  signature: null,
  stepUp: null,
  broadcast: null,
  error: null,
  rejectReason: null,
  hwAttestation: null,
};

/** Convert a WithdrawalRow into an op the signing flow can drive. */
export function withdrawalToOp(w: WithdrawalRow): SigningOp {
  return {
    id: w.id,
    chain: w.chain,
    token: w.token,
    amount: w.amount,
    destination: w.destination,
    safeAddress:
      w.chain === 'bnb'
        ? '0x8c3a7b9d4e1f2a6c8b5d9e3f1a4b7c6d8e2f5a1b'
        : '7YtVdBkF3mNqRs2JpL9xUa4HhZ6eW8gQnXyC1vTbKmPx',
    nonce: w.nonce,
    signaturesRequired: w.multisig.required,
    totalSigners: w.multisig.total,
    myIndex: w.multisig.collected + 1,
    destinationKnown: true,
    // Propagate tier + id so SigningFlowHost can insert HW prompt for cold ops
    sourceTier: w.sourceTier ?? 'hot',
    withdrawalId: w.id,
  };
}

export interface SigningFlow {
  state: SigningFlowState;
  start: (op: SigningOp) => void;
  /** Advance review → wallet-sign (or policy-block if policy fails). */
  confirmReview: () => void;
  walletSigned: (sig: SignedSignature) => void;
  /** Success of WebAuthn step-up — advances to execute. */
  stepUpPassed: (r: StepUpResult) => Promise<void>;
  /** Switch from step-up to OTP fallback. */
  useOtpFallback: () => void;
  /** OTP verified — same effect as stepUpPassed. */
  otpVerified: (r: StepUpResult) => Promise<void>;
  /**
   * Called by wallet-sign-popup after a real broadcast completes.
   * Transitions execute → done with the real tx hash.
   */
  broadcastComplete: (result: BroadcastResult) => void;
  /** Transitions execute → error with a message. */
  broadcastFailed: (error: string) => void;
  cancel: () => void;
  reject: (reason?: string) => void;
  reset: () => void;
  /**
   * Slice 7: called by HwPromptModal when the user confirms HW attestation.
   * Stores attestation on state and advances to wallet-sign.
   */
  hwAttested: (attestation: HwAttestation) => void;
}

/** Hook driving the signing state machine. Consume from a parent component. */
export function useSigningFlow(): SigningFlow {
  const [state, setState] = useState<SigningFlowState>(INITIAL);

  const start = useCallback((op: SigningOp) => {
    setState({ ...INITIAL, step: 'review', op });
  }, []);

  // review → policy-block OR wallet-sign based on policy evaluation.
  const confirmReview = useCallback(() => {
    setState((prev) => {
      if (prev.step !== 'review' || !prev.op) return prev;
      const policy = evaluatePolicy(prev.op);
      if (!policy.passed) return { ...prev, step: 'policy-block' };
      return { ...prev, step: 'wallet-sign' };
    });
  }, []);

  const walletSigned = useCallback((sig: SignedSignature) => {
    setState((prev) =>
      prev.step === 'wallet-sign' ? { ...prev, step: 'step-up', signature: sig } : prev
    );
  }, []);

  // Broadcast happens during 'execute' → transitions to 'done' or 'error'.
  // In dev-mode: uses mock. In real-mode: caller (wallet-sign-popup) performs
  // the real broadcast and calls broadcastComplete() directly.
  const broadcastAndFinish = useCallback((op: SigningOp) => {
    if (IS_DEV_MODE) {
      void broadcastDevMode(op)
        .then((result) =>
          setState((p) => (p.step === 'execute' ? { ...p, step: 'done', broadcast: result } : p))
        )
        .catch((e) =>
          setState((p) =>
            p.step === 'execute'
              ? { ...p, step: 'error', error: String((e as Error).message ?? 'Broadcast failed') }
              : p
          )
        );
    }
    // Real-mode: wallet-sign-popup drives broadcast and calls broadcastComplete().
  }, []);

  const stepUpPassed = useCallback(
    async (r: StepUpResult) => {
      setState((prev) => {
        if (prev.step !== 'step-up' || !prev.op) return prev;
        broadcastAndFinish(prev.op);
        return { ...prev, step: 'execute', stepUp: r };
      });
    },
    [broadcastAndFinish]
  );

  const useOtpFallback = useCallback(() => {
    setState((prev) => (prev.step === 'step-up' ? { ...prev, step: 'otp' } : prev));
  }, []);

  const otpVerified = useCallback(
    async (r: StepUpResult) => {
      setState((prev) => {
        if (prev.step !== 'otp' || !prev.op) return prev;
        broadcastAndFinish(prev.op);
        return { ...prev, step: 'execute', stepUp: r };
      });
    },
    [broadcastAndFinish]
  );

  const broadcastComplete = useCallback((result: BroadcastResult) => {
    setState((p) => (p.step === 'execute' ? { ...p, step: 'done', broadcast: result } : p));
  }, []);

  const broadcastFailed = useCallback((error: string) => {
    setState((p) => (p.step === 'execute' ? { ...p, step: 'error', error } : p));
  }, []);

  const cancel = useCallback(() => setState(INITIAL), []);

  const reject = useCallback((reason?: string) => {
    setState((prev) => ({
      ...prev,
      step: 'rejected',
      rejectReason: reason ?? 'Signer rejected operation.',
    }));
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  /**
   * Slice 7: HW attestation confirmed — store blob and advance to wallet-sign.
   * Called from HwPromptModal after user taps "Confirmed on device".
   */
  const hwAttested = useCallback((attestation: HwAttestation) => {
    setState((prev) =>
      prev.step === 'review' || prev.step === 'wallet-sign'
        ? { ...prev, step: 'wallet-sign', hwAttestation: attestation }
        : prev
    );
  }, []);

  return {
    state,
    start,
    confirmReview,
    walletSigned,
    stepUpPassed,
    useOtpFallback,
    otpVerified,
    broadcastComplete,
    broadcastFailed,
    cancel,
    reject,
    reset,
    hwAttested,
  };
}

export { mockSign };
export { IS_DEV_MODE, makeBroadcastResult } from './signing-flow-broadcast';
