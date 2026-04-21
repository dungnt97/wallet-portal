// Signing flow shared types — op, signature, broadcast result, state.
// Split from signing-flow.ts to keep each file under 200 LOC.

/**
 * 7-step state machine (mirrors prototype signing_modals.jsx):
 *   idle → review → { policy-block | reject | wallet-sign }
 *   wallet-sign → { reject | step-up }
 *   step-up → { reject | otp (fallback) | execute }
 *   otp → { reject | execute }
 *   execute → { done | error }
 */
export type SigningStep =
  | 'idle'
  | 'review'
  | 'policy-block'
  | 'wallet-sign'
  | 'step-up'
  | 'otp'
  | 'execute'
  | 'done'
  | 'rejected'
  | 'error';

export interface SigningOp {
  id: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: number;
  destination: string;
  /** Safe/Squads address on-chain */
  safeAddress?: string;
  nonce?: number;
  signaturesRequired: number;
  totalSigners: number;
  myIndex?: number;
  destinationKnown?: boolean;
  /**
   * Slice 7: cold-tier withdrawals require HW-attestation before signing.
   * When 'cold', SigningFlowHost inserts a hw-prompt modal before wallet-sign.
   */
  sourceTier?: 'hot' | 'cold';
  /** Slice 7: withdrawal UUID — used to construct the synthetic attestation blob in dev-mode. */
  withdrawalId?: string;
}

export interface SignedSignature {
  signer: string;
  signature: string;
  at: string;
}

export interface BroadcastResult {
  hash: string;
  blockNumber: number;
  confirmedAt: string;
}

export interface StepUpResult {
  method: 'webauthn' | 'totp';
  at: string;
}

export interface HwAttestation {
  /** base64-encoded attestation blob from hardware wallet (or synthetic in dev-mode) */
  blob: string;
  /** device type that produced the blob */
  type: 'ledger' | 'trezor';
}

export interface SigningFlowState {
  step: SigningStep;
  op: SigningOp | null;
  signature: SignedSignature | null;
  stepUp: StepUpResult | null;
  broadcast: BroadcastResult | null;
  error: string | null;
  rejectReason: string | null;
  /** Slice 7: set after HW prompt confirmed for cold-tier ops */
  hwAttestation: HwAttestation | null;
}
