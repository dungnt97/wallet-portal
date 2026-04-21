// Solana adapter — real @solana/wallet-adapter + Squads v4 SDK signing.
// Implements Ed25519 sign via wallet-adapter signMessage and Squads multisig
// propose/approve flows using @sqds/multisig v2 SDK.
// NOTE: @solana/wallet-adapter-base is a transitive dep not in ui/node_modules directly.
// We define a minimal local interface covering the API surface we actually use.
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import type { Connection, Transaction, VersionedTransaction as VT } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

/** Minimal wallet adapter interface — matches @solana/wallet-adapter-base Adapter shape. */
export interface WalletAdapter {
  publicKey: PublicKey | null;
  sendTransaction(
    transaction: Transaction | VT,
    connection: Connection,
    options?: { signers?: unknown[] }
  ): Promise<string>;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface SolanaSignParams {
  /** Serialized proposal or arbitrary bytes to sign (Ed25519). */
  message: Uint8Array;
}

export interface SolanaSignResult {
  signature: Uint8Array;
  signedAt: Date;
  signer: PublicKey;
}

export interface SolanaSquadsProposeParams {
  multisigPda: PublicKey;
  creator: PublicKey;
  transactionMessage: TransactionMessage;
  memo?: string;
}

export interface SolanaSquadsProposeResult {
  proposalPubkey: PublicKey;
  signature: string;
}

export interface SolanaApproveResult {
  signature: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Derive Squads multisig PDA from env; logs warning if not set. */
export function getSquadsMultisigPda(): PublicKey | null {
  const pda = import.meta.env.VITE_SQUADS_MULTISIG_PDA_DEVNET as string | undefined;
  if (!pda) {
    console.warn(
      '[solana-adapter] VITE_SQUADS_MULTISIG_PDA_DEVNET not set. ' +
        'Squads operations will fail until a multisig is deployed.'
    );
    return null;
  }
  try {
    return new PublicKey(pda);
  } catch {
    console.error(
      '[solana-adapter] VITE_SQUADS_MULTISIG_PDA_DEVNET is not a valid PublicKey:',
      pda
    );
    return null;
  }
}

/** Derive the vault PDA address from the multisig PDA (index 0). */
export function deriveVaultPda(multisigPda: PublicKey, vaultIndex = 0): PublicKey {
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: vaultIndex });
  return vaultPda;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Sign arbitrary bytes (Ed25519) using the connected Solana wallet.
 * Wraps wallet-adapter signMessage; throws descriptive error on failure.
 */
export async function solanaSign(
  params: SolanaSignParams,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>
): Promise<SolanaSignResult> {
  if (params.message.length === 0) {
    throw new Error('[solana-adapter] solanaSign: message must not be empty');
  }

  let signature: Uint8Array;
  try {
    signature = await signMessage(params.message);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Solana sign failed';
    throw new Error(`[solana-adapter] solanaSign: ${msg}`);
  }

  if (!signature || signature.length === 0) {
    throw new Error('[solana-adapter] solanaSign: empty signature returned from wallet');
  }

  // Derive signer public key from wallet adapter; passed via closure context
  // The actual PublicKey is resolved by the caller — we return a placeholder
  // that the host should replace with wallet.publicKey after signing.
  const signerPlaceholder = PublicKey.default;

  return {
    signature,
    signedAt: new Date(),
    signer: signerPlaceholder,
  };
}

/**
 * Propose a new vault transaction on a Squads v4 multisig.
 * Creates the vaultTransaction + proposal accounts, sends via wallet.
 */
export async function solanaProposeSquads(
  params: SolanaSquadsProposeParams,
  connection: Connection,
  wallet: WalletAdapter
): Promise<SolanaSquadsProposeResult> {
  const { multisigPda, creator, transactionMessage, memo } = params;

  if (!wallet.publicKey) {
    throw new Error('[solana-adapter] solanaProposeSquads: wallet not connected');
  }

  // Load the multisig account to get current transaction index
  let multisigAccount: Awaited<ReturnType<typeof multisig.accounts.Multisig.fromAccountAddress>>;
  try {
    multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[solana-adapter] solanaProposeSquads: failed to load multisig: ${msg}`);
  }

  // multisigAccount.transactionIndex is beet.bignum (BN-like); convert to bigint safely
  const currentIndex = BigInt(
    typeof multisigAccount.transactionIndex === 'bigint'
      ? multisigAccount.transactionIndex
      : (multisigAccount.transactionIndex as { toNumber(): number }).toNumber()
  );
  const transactionIndex = currentIndex + 1n;

  // Derive the vault transaction PDA
  const [vaultTransactionPda] = multisig.getTransactionPda({
    multisigPda,
    index: transactionIndex,
  });

  // Build vaultTransactionCreate instruction
  const createIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex,
    creator,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage,
    memo: memo ?? undefined,
  });

  // Build proposalCreate instruction
  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator,
  });

  // Assemble transaction
  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [createIx, proposalIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);

  let signature: string;
  try {
    const signed = await wallet.sendTransaction(tx, connection);
    signature = signed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[solana-adapter] solanaProposeSquads: sendTransaction failed: ${msg}`);
  }

  return {
    proposalPubkey: vaultTransactionPda,
    signature,
  };
}

/**
 * Approve an existing Squads v4 proposal.
 * Sends a proposalApprove instruction signed by the wallet.
 */
export async function solanaApproveProposal(
  proposalPubkey: PublicKey,
  wallet: WalletAdapter,
  connection: Connection
): Promise<SolanaApproveResult> {
  if (!wallet.publicKey) {
    throw new Error('[solana-adapter] solanaApproveProposal: wallet not connected');
  }

  // Derive multisigPda and transactionIndex from the proposal account address.
  // In Squads v4, we need to load the proposal to get its multisig + index.
  // The proposalPubkey IS the vault transaction PDA; we need to find the multisig.
  // Per the spec, callers pass the proposalPubkey (vault transaction PDA).
  // We load it to derive the multisig context.
  let proposalAccount: Awaited<ReturnType<typeof multisig.accounts.Proposal.fromAccountAddress>>;
  try {
    proposalAccount = await multisig.accounts.Proposal.fromAccountAddress(
      connection,
      proposalPubkey
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[solana-adapter] solanaApproveProposal: failed to load proposal: ${msg}`);
  }

  // proposalAccount.transactionIndex is beet.bignum; convert to bigint
  const proposalTxIndex = BigInt(
    typeof proposalAccount.transactionIndex === 'bigint'
      ? proposalAccount.transactionIndex
      : (proposalAccount.transactionIndex as { toNumber(): number }).toNumber()
  );

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda: proposalAccount.multisig,
    transactionIndex: proposalTxIndex,
    member: wallet.publicKey,
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [approveIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);

  let signature: string;
  try {
    signature = await wallet.sendTransaction(tx, connection);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[solana-adapter] solanaApproveProposal: sendTransaction failed: ${msg}`);
  }

  return { signature };
}
