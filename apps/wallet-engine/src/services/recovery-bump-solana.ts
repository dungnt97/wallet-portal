// Solana bump service — rebuilds a stuck Solana tx with a fresh blockhash +
// higher ComputeBudget unit price.
//
// Solana has no nonce concept — "bump" = rebroadcast with fresh recent blockhash
// and higher compute unit price so validators prioritise it.
//
// Bump formula: newMicroLamports = max(currentPrice × feeMultiplier, DEFAULT_MIN_CU_PRICE)
// Dev-mode (AUTH_DEV_MODE=true OR missing seed): returns synthetic signature.
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';
import pino from 'pino';

const logger = pino({ name: 'recovery-bump-solana' });

// Default minimum compute unit price when no prior price is known
const DEFAULT_MIN_CU_PRICE = 10_000; // microLamports

export interface BumpSolanaParams {
  /** Raw transaction bytes (base64) of the original stuck tx */
  originalTxBase64: string;
  /** Current compute unit price in microLamports (0 = not set, use default) */
  currentCuPriceMicroLamports: number;
  /** Fee multiplier (e.g. 1.5 for 50% increase) */
  feeMultiplier: number;
  /** HD derivation index for the signing keypair */
  hdIndex: number;
}

export interface BumpSolanaResult {
  txSignature: string;
  newCuPriceMicroLamports: number;
}

function isDevMode(): boolean {
  return (
    process.env.AUTH_DEV_MODE === 'true' ||
    !process.env.HD_MASTER_SEED_SOLANA ||
    process.env.HD_MASTER_SEED_SOLANA === ''
  );
}

function syntheticSignature(): string {
  const bytes = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
  );
  return bytes.join('');
}

/**
 * Derive a Solana ed25519 keypair from HD_MASTER_SEED_SOLANA at the given index.
 * Path: m/44'/501'/{index}'/0'
 */
function deriveKeypair(hexSeed: string, index: number): Keypair {
  const path = `m/44'/501'/${index}'/0'`;
  const seed = Buffer.from(hexSeed, 'hex');
  const { key } = derivePath(path, seed.toString('hex'));
  return Keypair.fromSeed(key);
}

/**
 * Rebuild a stuck Solana tx with a fresh recent blockhash and a higher
 * compute unit price, then broadcast it.
 *
 * The original tx instructions are preserved; only the blockhash and
 * compute-budget instruction are replaced/added.
 */
export async function bumpSolanaTx(
  params: BumpSolanaParams,
  connection: Connection
): Promise<BumpSolanaResult> {
  const { originalTxBase64, currentCuPriceMicroLamports, feeMultiplier, hdIndex } = params;

  if (isDevMode()) {
    const fakeSig = syntheticSignature();
    logger.warn({ fakeSig }, 'DEV MODE: synthetic Solana bump — no real signing');
    return { txSignature: fakeSig, newCuPriceMicroLamports: DEFAULT_MIN_CU_PRICE };
  }

  // 1. Compute new CU price
  const basePrice =
    currentCuPriceMicroLamports > 0 ? currentCuPriceMicroLamports : DEFAULT_MIN_CU_PRICE;
  const newCuPrice = Math.max(Math.ceil(basePrice * feeMultiplier), DEFAULT_MIN_CU_PRICE);

  // 2. Deserialise original tx to extract instructions (excluding old ComputeBudget ones)
  const origTxBuf = Buffer.from(originalTxBase64, 'base64');
  const origTx = Transaction.from(origTxBuf);

  const COMPUTE_BUDGET_PROGRAM_ID = ComputeBudgetProgram.programId.toBase58();
  const userInstructions: TransactionInstruction[] = origTx.instructions.filter(
    (ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID
  );

  // 3. Get fresh blockhash — fail-closed if RPC unavailable
  let latestBlockhash: Awaited<ReturnType<typeof connection.getLatestBlockhash>>;
  try {
    latestBlockhash = await connection.getLatestBlockhash('confirmed');
  } catch (err) {
    logger.error({ err }, 'Failed to fetch Solana blockhash — failing closed');
    throw new Error('SOLANA_BLOCKHASH_UNAVAILABLE');
  }

  // 4. Reconstruct tx with new CU price + fresh blockhash
  const hexSeed = process.env.HD_MASTER_SEED_SOLANA ?? '';
  const keypair = deriveKeypair(hexSeed, hdIndex);

  const newTx = new Transaction();
  newTx.recentBlockhash = latestBlockhash.blockhash;
  newTx.feePayer = keypair.publicKey;

  // Prepend compute budget instructions (price first, then limit if needed)
  newTx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: newCuPrice }));

  // Re-add original user instructions
  for (const ix of userInstructions) {
    newTx.add(ix);
  }

  // 5. Sign and broadcast
  newTx.sign(keypair);
  const signature = await connection.sendRawTransaction(newTx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  logger.info(
    { signature, newCuPriceMicroLamports: newCuPrice, hdIndex },
    'Solana bump tx broadcast'
  );

  return { txSignature: signature, newCuPriceMicroLamports: newCuPrice };
}
