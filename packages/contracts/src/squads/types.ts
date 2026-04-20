// MVP STUB — Squads multisig proposal shape (Solana)
// Full implementation wired in P09 withdrawal flow via @sqds/multisig SDK.

/** Minimal Squads proposal used for UI display and DB tracking. */
export type SquadsProposal = {
  /** On-chain proposal PDA address (base58) */
  publicKey: string;
  /** Index within the multisig vault */
  transactionIndex: bigint;
  status: 'Draft' | 'Active' | 'Rejected' | 'Approved' | 'Executing' | 'Executed' | 'Cancelled';
  approved: string[]; // pubkeys that approved
  rejected: string[]; // pubkeys that rejected
  cancelled: string[]; // pubkeys that cancelled
};
