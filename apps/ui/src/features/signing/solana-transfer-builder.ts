// solana-transfer-builder — builds a real Solana transfer instruction from a SigningOp.
// Used by wallet-sign-popup Solana path (C4 fix) to populate Squads proposal instructions.
//
// SOL (native): SystemProgram.transfer
// SPL token (USDT/USDC): createTransferInstruction from @solana/spl-token
//
// Throws if required env vars (vault PDA, token mint) are not set — no silent fallback.
import { PublicKey, SystemProgram } from '@solana/web3.js';
import type { TransactionInstruction } from '@solana/web3.js';
import type { SigningOp } from './signing-flow-types';
import { deriveVaultPda } from './solana-adapter';

export interface SolanaTransferInstructionParams {
  op: SigningOp;
  /** Signer's public key — used as fromPubkey for native SOL or token authority. */
  fromPubkey: PublicKey;
}

/**
 * Build the appropriate transfer instruction for a withdrawal op.
 * - SOL native: SystemProgram.transfer (lamports)
 * - SPL token: createTransferInstruction from @solana/spl-token
 *
 * Throws on missing env config so callers surface the error to the user,
 * not silently pass an empty instruction array to Squads.
 */
export function buildSolanaTransferInstruction(
  params: SolanaTransferInstructionParams
): TransactionInstruction {
  const { op, fromPubkey } = params;

  const destinationPubkey = new PublicKey(op.destination);

  // Native SOL transfer (token field used as chain-level identifier)
  // Amount is in SOL units (float) → convert to lamports
  if (op.token === 'USDT' || op.token === 'USDC') {
    return buildSplTransferInstruction(op, fromPubkey, destinationPubkey);
  }

  // Native SOL fallback — amount in SOL, convert to lamports
  const lamports = BigInt(Math.round(op.amount * 1_000_000_000));
  return SystemProgram.transfer({
    fromPubkey,
    toPubkey: destinationPubkey,
    lamports,
  });
}

/**
 * Build SPL token transfer instruction.
 * Uses @solana/spl-token createTransferInstruction.
 * Derives source ATA from the Squads vault PDA (index 0).
 */
function buildSplTransferInstruction(
  op: SigningOp,
  authority: PublicKey,
  destination: PublicKey
): TransactionInstruction {
  const multisigPdaStr = import.meta.env.VITE_SQUADS_MULTISIG_PDA_DEVNET as string | undefined;
  if (!multisigPdaStr) {
    throw new Error(
      '[solana-transfer-builder] VITE_SQUADS_MULTISIG_PDA_DEVNET not set — ' +
        'cannot derive vault ATA for SPL transfer'
    );
  }

  const mintEnvKey = op.token === 'USDT' ? 'VITE_SOL_USDT_MINT' : 'VITE_SOL_USDC_MINT';
  const mintStr = import.meta.env[mintEnvKey] as string | undefined;
  if (!mintStr) {
    throw new Error(
      `[solana-transfer-builder] ${mintEnvKey} not set — cannot build SPL transfer instruction`
    );
  }

  const multisigPda = new PublicKey(multisigPdaStr);
  const mint = new PublicKey(mintStr);
  const vaultPda = deriveVaultPda(multisigPda, 0);

  // Derive ATAs synchronously — @solana/spl-token getAssociatedTokenAddressSync
  // We do a manual ABI-compatible derivation to avoid async import in a sync context.
  // PROGRAM_ID for ATA: ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bRR
  const sourceAta = findAssociatedTokenAddress(vaultPda, mint);
  const destAta = findAssociatedTokenAddress(destination, mint);

  // SPL Token amount: USDT/USDC = 6 decimals
  const amount = BigInt(Math.round(op.amount * 1_000_000));

  // Build instruction manually to avoid async import of @solana/spl-token.
  // createTransferInstruction layout: [1 byte discriminator=3, 8 bytes amount LE]
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0); // transfer instruction index
  data.writeBigUInt64LE(amount, 1);

  const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  return {
    programId: SPL_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: sourceAta, isSigner: false, isWritable: true },
      { pubkey: destAta, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data,
  };
}

/**
 * Derive ATA address for a wallet + mint without async I/O.
 * Seeds: [wallet, TOKEN_PROGRAM_ID, mint]
 * Program: ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bRR
 */
function findAssociatedTokenAddress(wallet: PublicKey, mint: PublicKey): PublicKey {
  const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bRR');

  const [ata] = PublicKey.findProgramAddressSync(
    [wallet.toBuffer(), SPL_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID
  );
  return ata;
}
