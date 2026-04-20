// Signing flow orchestrator — review → wallet-sign → step-up → execute → done.
// Pass 4 ports the 811-LOC prototype signing_modals.jsx into a state machine
// that drives the separate modal components. All chain calls are mocked by
// default; real wagmi/viem adapters can slot in behind this interface.
import { useCallback, useState } from 'react';
import type { FixWithdrawal } from '../_shared/fixtures-flows';
import { mockBroadcast, mockSign } from './mock-adapters';
import type { SignedSignature, SigningFlowState, SigningOp } from './signing-flow-types';

// Re-export types for external consumers
export type {
  BroadcastResult,
  SignedSignature,
  SigningFlowState,
  SigningOp,
  SigningStep,
} from './signing-flow-types';

const INITIAL: SigningFlowState = {
  step: 'idle',
  op: null,
  signature: null,
  broadcast: null,
  error: null,
};

/** Convert a fixture withdrawal into an op the signing flow can drive. */
export function withdrawalToOp(w: FixWithdrawal): SigningOp {
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
  };
}

export interface SigningFlow {
  state: SigningFlowState;
  start: (op: SigningOp) => void;
  confirmReview: () => void;
  walletSigned: (sig: SignedSignature) => void;
  stepUpPassed: () => Promise<void>;
  cancel: () => void;
  reject: (reason?: string) => void;
  reset: () => void;
}

/** Hook driving the signing state machine. Consume from a parent component. */
export function useSigningFlow(): SigningFlow {
  const [state, setState] = useState<SigningFlowState>(INITIAL);

  const start = useCallback((op: SigningOp) => {
    setState({ step: 'review', op, signature: null, broadcast: null, error: null });
  }, []);

  const confirmReview = useCallback(() => {
    setState((prev) => (prev.step === 'review' ? { ...prev, step: 'wallet-sign' } : prev));
  }, []);

  const walletSigned = useCallback((sig: SignedSignature) => {
    setState((prev) =>
      prev.step === 'wallet-sign' ? { ...prev, step: 'step-up', signature: sig } : prev
    );
  }, []);

  const stepUpPassed = useCallback(async () => {
    setState((prev) => {
      if (prev.step !== 'step-up' || !prev.op) return prev;
      void mockBroadcast(prev.op).then((result) => {
        setState((p) => ({ ...p, step: 'done', broadcast: result }));
      });
      return { ...prev, step: 'execute' };
    });
  }, []);

  const cancel = useCallback(() => setState(INITIAL), []);

  const reject = useCallback((reason?: string) => {
    setState((prev) => ({
      ...prev,
      step: 'rejected',
      error: reason ?? 'Signer rejected operation.',
    }));
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  return {
    state,
    start,
    confirmReview,
    walletSigned,
    stepUpPassed,
    cancel,
    reject,
    reset,
  };
}

export { mockSign, mockBroadcast };
