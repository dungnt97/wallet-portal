// Canonical internal types for the withdrawals feature.
// Replaces FixWithdrawal from fixtures/ — no fixture data imported here.
// ApiWithdrawal (from use-withdrawals.ts) is adapted to this shape for display.

export type WithdrawalStage =
  | 'draft'
  | 'awaiting_signatures'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'time_locked'
  | 'broadcast'
  | 'cancelling'
  | 'cancelled';

export interface WithdrawalApprover {
  staffId: string;
  at: string;
  txSig: string;
}

export interface WithdrawalMultisig {
  required: number;
  total: number;
  collected: number;
  approvers: WithdrawalApprover[];
  rejectedBy: string | null;
}

/** Internal display type — used by table, sheet, action handlers, signing flow. */
export interface WithdrawalRow {
  id: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: number;
  destination: string;
  stage: WithdrawalStage;
  risk: 'low' | 'med' | 'high';
  createdAt: string;
  requestedBy: string;
  multisig: WithdrawalMultisig;
  txHash: string | null;
  note: string | null;
  nonce?: number;
  /** Tier from API — optional, only on responses that include it */
  sourceTier?: 'hot' | 'cold';
  /** Time-lock unlock timestamp — present for cold-tier withdrawals */
  timeLockExpiresAt?: string;
  multisigOpId?: string;
}
