// Solana signer ceremony tx builder — wraps Squads v4 @sqds/multisig SDK.
//
// Actual API found by grepping @sqds/multisig@2.1.4 declarations:
//   transactions.configTransactionCreate({ blockhash, feePayer, creator, multisigPda,
//     transactionIndex, actions: ConfigAction[] }) → VersionedTransaction
//   transactions.proposalCreate({ blockhash, feePayer, multisigPda,
//     transactionIndex, creator }) → VersionedTransaction
//   transactions.proposalApprove({ blockhash, feePayer, multisigPda,
//     transactionIndex, member }) → VersionedTransaction
//   transactions.configTransactionExecute({ blockhash, feePayer, multisigPda,
//     transactionIndex, member, rentPayer }) → VersionedTransaction
//
// ConfigAction union: { __kind:'AddMember', newMember:{key,permissions} }
//                   | { __kind:'RemoveMember', oldMember: PublicKey }
//                   | { __kind:'ChangeThreshold', newThreshold: number }
//
// Member.permissions.mask values:
//   0b001 = Initiate, 0b010 = Vote, 0b100 = Execute; 0b111 = all
import { PublicKey } from '@solana/web3.js';
import { type generated as sqdsGenerated, transactions as sqdsTransactions } from '@sqds/multisig';

// ConfigAction is exported under the `generated` namespace
type ConfigAction = sqdsGenerated.ConfigAction;
import pino from 'pino';

const logger = pino({ name: 'signer-ceremony-solana' });

// ── Constants ─────────────────────────────────────────────────────────────────

/** Full permissions mask: Initiate (1) + Vote (2) + Execute (4) */
const FULL_PERMISSIONS = { mask: 7 };

// ── Output shape ──────────────────────────────────────────────────────────────

export interface SquadsVersionedTxSet {
  /** The configTransaction create instruction as base64-encoded VersionedTransaction */
  configTxBase64: string;
  /** The proposalCreate instruction as base64-encoded VersionedTransaction */
  proposalBase64: string;
  /** Transaction index used for this ceremony step (needed for approve + execute) */
  transactionIndex: bigint;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function serializeTx(tx: { serialize(): Uint8Array }): string {
  return Buffer.from(tx.serialize()).toString('base64');
}

// ── Public builders ───────────────────────────────────────────────────────────

/**
 * Build configTransaction + proposal for adding a new member.
 * Caller supplies blockhash + current transactionIndex from the Squads multisig account.
 */
export function buildAddMemberTx(params: {
  multisigPda: string;
  newMemberPubkey: string;
  transactionIndex: bigint;
  creatorPubkey: string;
  feePayerPubkey: string;
  blockhash: string;
}): SquadsVersionedTxSet {
  const {
    multisigPda,
    newMemberPubkey,
    transactionIndex,
    creatorPubkey,
    feePayerPubkey,
    blockhash,
  } = params;

  logger.debug({ multisigPda, newMemberPubkey }, 'buildAddMemberTx');

  const actions: ConfigAction[] = [
    {
      __kind: 'AddMember',
      newMember: {
        key: new PublicKey(newMemberPubkey),
        permissions: FULL_PERMISSIONS,
      },
    },
  ];

  const configTx = sqdsTransactions.configTransactionCreate({
    blockhash,
    feePayer: new PublicKey(feePayerPubkey),
    creator: new PublicKey(creatorPubkey),
    multisigPda: new PublicKey(multisigPda),
    transactionIndex,
    actions,
  });

  const proposal = sqdsTransactions.proposalCreate({
    blockhash,
    feePayer: new PublicKey(feePayerPubkey),
    multisigPda: new PublicKey(multisigPda),
    transactionIndex,
    creator: new PublicKey(creatorPubkey),
  });

  return {
    configTxBase64: serializeTx(configTx),
    proposalBase64: serializeTx(proposal),
    transactionIndex,
  };
}

/**
 * Build configTransaction + proposal for removing a member.
 */
export function buildRemoveMemberTx(params: {
  multisigPda: string;
  removeMemberPubkey: string;
  transactionIndex: bigint;
  creatorPubkey: string;
  feePayerPubkey: string;
  blockhash: string;
}): SquadsVersionedTxSet {
  const {
    multisigPda,
    removeMemberPubkey,
    transactionIndex,
    creatorPubkey,
    feePayerPubkey,
    blockhash,
  } = params;

  logger.debug({ multisigPda, removeMemberPubkey }, 'buildRemoveMemberTx');

  const actions: ConfigAction[] = [
    {
      __kind: 'RemoveMember',
      oldMember: new PublicKey(removeMemberPubkey),
    },
  ];

  const configTx = sqdsTransactions.configTransactionCreate({
    blockhash,
    feePayer: new PublicKey(feePayerPubkey),
    creator: new PublicKey(creatorPubkey),
    multisigPda: new PublicKey(multisigPda),
    transactionIndex,
    actions,
  });

  const proposal = sqdsTransactions.proposalCreate({
    blockhash,
    feePayer: new PublicKey(feePayerPubkey),
    multisigPda: new PublicKey(multisigPda),
    transactionIndex,
    creator: new PublicKey(creatorPubkey),
  });

  return {
    configTxBase64: serializeTx(configTx),
    proposalBase64: serializeTx(proposal),
    transactionIndex,
  };
}

/**
 * Build configTransaction + proposal for a rotate (multiple AddMember + RemoveMember
 * in a single configTransaction, optionally including a ChangeThreshold action).
 */
export function buildRotateMembersTx(params: {
  multisigPda: string;
  addMemberPubkeys: string[];
  removeMemberPubkeys: string[];
  transactionIndex: bigint;
  creatorPubkey: string;
  feePayerPubkey: string;
  blockhash: string;
  /** Optional new threshold — omit to keep current threshold unchanged */
  newThreshold?: number;
}): SquadsVersionedTxSet {
  const {
    multisigPda,
    addMemberPubkeys,
    removeMemberPubkeys,
    transactionIndex,
    creatorPubkey,
    feePayerPubkey,
    blockhash,
    newThreshold,
  } = params;

  logger.debug(
    { multisigPda, addCount: addMemberPubkeys.length, removeCount: removeMemberPubkeys.length },
    'buildRotateMembersTx'
  );

  const actions: ConfigAction[] = [
    // Adds first, then removes — order matters for threshold consistency
    ...addMemberPubkeys.map(
      (pk): ConfigAction => ({
        __kind: 'AddMember',
        newMember: { key: new PublicKey(pk), permissions: FULL_PERMISSIONS },
      })
    ),
    ...removeMemberPubkeys.map(
      (pk): ConfigAction => ({
        __kind: 'RemoveMember',
        oldMember: new PublicKey(pk),
      })
    ),
  ];

  if (newThreshold !== undefined) {
    actions.push({ __kind: 'ChangeThreshold', newThreshold });
  }

  const configTx = sqdsTransactions.configTransactionCreate({
    blockhash,
    feePayer: new PublicKey(feePayerPubkey),
    creator: new PublicKey(creatorPubkey),
    multisigPda: new PublicKey(multisigPda),
    transactionIndex,
    actions,
  });

  const proposal = sqdsTransactions.proposalCreate({
    blockhash,
    feePayer: new PublicKey(feePayerPubkey),
    multisigPda: new PublicKey(multisigPda),
    transactionIndex,
    creator: new PublicKey(creatorPubkey),
  });

  return {
    configTxBase64: serializeTx(configTx),
    proposalBase64: serializeTx(proposal),
    transactionIndex,
  };
}

/**
 * Build a proposalApprove transaction for a given member.
 */
export function buildProposalApproveTx(params: {
  multisigPda: string;
  transactionIndex: bigint;
  memberPubkey: string;
  feePayerPubkey: string;
  blockhash: string;
}): string {
  const { multisigPda, transactionIndex, memberPubkey, feePayerPubkey, blockhash } = params;

  const tx = sqdsTransactions.proposalApprove({
    blockhash,
    feePayer: new PublicKey(feePayerPubkey),
    multisigPda: new PublicKey(multisigPda),
    transactionIndex,
    member: new PublicKey(memberPubkey),
  });

  return serializeTx(tx);
}

/**
 * Build a configTransactionExecute transaction.
 */
export function buildConfigTransactionExecuteTx(params: {
  multisigPda: string;
  transactionIndex: bigint;
  memberPubkey: string;
  rentPayerPubkey: string;
  feePayerPubkey: string;
  blockhash: string;
}): string {
  const {
    multisigPda,
    transactionIndex,
    memberPubkey,
    rentPayerPubkey,
    feePayerPubkey,
    blockhash,
  } = params;

  const tx = sqdsTransactions.configTransactionExecute({
    blockhash,
    feePayer: new PublicKey(feePayerPubkey),
    multisigPda: new PublicKey(multisigPda),
    transactionIndex,
    member: new PublicKey(memberPubkey),
    rentPayer: new PublicKey(rentPayerPubkey),
  });

  return serializeTx(tx);
}
