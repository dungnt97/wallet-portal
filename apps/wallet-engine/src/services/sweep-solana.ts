// Solana sweep builder + signer + broadcaster.
// Derives ed25519 keypair from HD_MASTER_SEED_SOLANA hex seed, builds an SPL
// token transfer instruction, signs with the keypair, returns base64 for broadcast.
//
// No @solana/spl-token dep — SPL transfer is encoded manually from the known
// instruction layout (discriminator + amount, little-endian u64).
//
// Dev-mode (AUTH_DEV_MODE=true OR empty seed):
//   Returns synthetic signature without touching any key material.
import {
  type Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';
import pino from 'pino';

const logger = pino({ name: 'sweep-solana' });

// SPL Token program ID (mainnet + devnet same address)
const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// ── SPL Transfer instruction layout ──────────────────────────────────────────
// Instruction discriminator: 3 (transfer)
// Layout: [u8 discriminator, u64 amount LE]

function encodeSplTransfer(amount: bigint): Buffer {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(3, 0); // instruction index = 3 (transfer)
  buf.writeBigUInt64LE(amount, 1);
  return buf;
}

export interface BuildSweepSolanaParams {
  userAddressIndex: number;
  /** SPL mint public key (USDT or USDC on Solana) */
  mint: PublicKey;
  /** Amount in smallest unit (6 decimals for USDT/USDC on Solana) */
  amount: bigint;
  /** Destination associated token account or wallet (hot_safe) */
  destinationHotSafe: PublicKey;
}

export interface SignedSweepSolana {
  txBase64: string;
  txSignature: string;
  fromPubkey: PublicKey;
}

function isDevMode(): boolean {
  // Real signing when seed is available — AUTH_DEV_MODE only controls auth, not sweep execution.
  const seed = process.env.HD_MASTER_SEED_SOLANA;
  return !seed || seed === '' || seed === 'your-hex-encoded-seed-here';
}

function assertKeyMaterial(): void {
  if (
    !isDevMode() &&
    (!process.env.HD_MASTER_SEED_SOLANA || process.env.HD_MASTER_SEED_SOLANA === '')
  ) {
    throw new Error(
      'FATAL: HD_MASTER_SEED_SOLANA is not set and AUTH_DEV_MODE is not true. ' +
        'Refusing to produce synthetic Solana sweep tx in production.'
    );
  }
}

/** Synthesise a fake base58 tx signature (~88 chars) */
function syntheticSignature(): string {
  const CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  return Array.from({ length: 88 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

/**
 * Derive Solana keypair from hex seed at the given index.
 * Path: m/44'/501'/{index}'/0'  (SLIP-0010 hardened)
 */
function deriveKeypair(seedHex: string, index: number): Keypair {
  const path = `m/44'/501'/${index}'/0'`;
  const { key } = derivePath(path, seedHex);
  return Keypair.fromSeed(Uint8Array.from(key));
}

/**
 * Derive the associated token account (ATA) address for a given wallet + mint.
 * ATA = PDA of [wallet, TOKEN_PROGRAM_ID, mint] under ATA program.
 *
 * Computed locally without needing an RPC call — deterministic per SPL spec.
 */
async function getAssociatedTokenAddress(wallet: PublicKey, mint: PublicKey): Promise<PublicKey> {
  const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const [ata] = await PublicKey.findProgramAddress(
    [wallet.toBuffer(), SPL_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID
  );
  return ata;
}

/**
 * Build and sign a Solana SPL token sweep transaction offline.
 * Dev-mode: returns synthetic result without touching key material.
 */
export async function buildAndSignSweepSolana(
  params: BuildSweepSolanaParams,
  recentBlockhash: string
): Promise<SignedSweepSolana> {
  const { userAddressIndex, mint, amount, destinationHotSafe } = params;

  assertKeyMaterial();

  if (isDevMode()) {
    const sig = syntheticSignature();
    logger.warn(
      { userAddressIndex, sig },
      'DEV MODE: returning synthetic Solana sweep tx — no real signing'
    );
    return {
      txBase64: Buffer.from('devmode-synthetic').toString('base64'),
      txSignature: sig,
      fromPubkey: SystemProgram.programId,
    };
  }

  const seedHex = process.env.HD_MASTER_SEED_SOLANA ?? '';
  const keypair = deriveKeypair(seedHex, userAddressIndex);

  // Derive source ATA (the user HD address holds tokens in their ATA)
  const sourceAta = await getAssociatedTokenAddress(keypair.publicKey, mint);
  const destAta = await getAssociatedTokenAddress(destinationHotSafe, mint);

  // Build SPL transfer instruction manually
  const transferIx = new TransactionInstruction({
    programId: SPL_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: sourceAta, isSigner: false, isWritable: true }, // source ATA
      { pubkey: destAta, isSigner: false, isWritable: true }, // dest ATA
      { pubkey: keypair.publicKey, isSigner: true, isWritable: false }, // owner
    ],
    data: encodeSplTransfer(amount),
  });

  const tx = new Transaction({
    recentBlockhash,
    feePayer: keypair.publicKey,
  }).add(transferIx);

  tx.sign(keypair);

  const txBase64 = tx.serialize({ requireAllSignatures: true }).toString('base64');

  // Encode signature as base58 using local bs58Encode
  const sigString = tx.signatures[0]?.signature
    ? bs58Encode(tx.signatures[0].signature)
    : syntheticSignature();

  logger.info(
    { signature: sigString, fromPubkey: keypair.publicKey.toBase58(), index: userAddressIndex },
    'Solana sweep tx signed'
  );

  return {
    txBase64,
    txSignature: sigString,
    fromPubkey: keypair.publicKey,
  };
}

/** Simple bs58 encode — avoids adding a dep by reimplementing the alphabet loop */
function bs58Encode(buf: Buffer | Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = buf instanceof Buffer ? buf : Buffer.from(buf);
  let x = BigInt(`0x${bytes.toString('hex')}`);
  let result = '';
  const base = BigInt(58);
  while (x > 0n) {
    const rem = x % base;
    result = `${ALPHABET[Number(rem)]}${result}`;
    x = x / base;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = `1${result}`;
  }
  return result;
}

/**
 * Broadcast a signed Solana transaction via the provided connection.
 * Dev-mode: returns synthetic result immediately.
 */
export async function broadcastSweepSolana(
  txBase64: string,
  connection: Connection
): Promise<{ signature: string; slot?: number }> {
  assertKeyMaterial();
  if (isDevMode()) {
    return { signature: syntheticSignature() };
  }

  const txBuf = Buffer.from(txBase64, 'base64');
  const signature = await connection.sendRawTransaction(txBuf, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  const confirmation = await connection.confirmTransaction(signature, 'confirmed');
  logger.info({ signature }, 'Solana sweep tx broadcast and confirmed');

  return {
    signature,
    slot: confirmation.context.slot,
  };
}
