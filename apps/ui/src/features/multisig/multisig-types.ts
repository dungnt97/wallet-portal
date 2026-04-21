// Internal display types for the multisig feature.
// Replaces (typeof FIX_MULTISIG_OPS)[number] from fixtures.

export interface MultisigApproverRow {
  staffId: string;
  at: string;
  txSig: string;
}

export interface MultisigOpDisplay {
  id: string;
  withdrawalId: string | null;
  chain: 'bnb' | 'sol';
  /** operationType from DB — e.g. 'withdrawal', 'signer_add' */
  operationType: string;
  multisigAddr: string;
  /** Readable vault label derived from chain */
  safeName: string;
  /** Amount in USD if linked to a withdrawal — null for non-withdrawal ops */
  amount: number;
  token: 'USDT' | 'USDC' | null;
  destination: string;
  nonce: number;
  required: number;
  total: number;
  collected: number;
  approvers: MultisigApproverRow[];
  rejectedBy: string | null;
  status: 'pending' | 'collecting' | 'ready' | 'submitted' | 'confirmed' | 'expired' | 'failed';
  expiresAt: string;
  createdAt: string;
}
