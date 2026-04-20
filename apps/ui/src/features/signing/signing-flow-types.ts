// Signing flow shared types — op, signature, broadcast result, state.
// Split from signing-flow.ts to keep each file under 200 LOC.

export type SigningStep =
  | 'idle'
  | 'review'
  | 'wallet-sign'
  | 'step-up'
  | 'execute'
  | 'done'
  | 'rejected';

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

export interface SigningFlowState {
  step: SigningStep;
  op: SigningOp | null;
  signature: SignedSignature | null;
  broadcast: BroadcastResult | null;
  error: string | null;
}
