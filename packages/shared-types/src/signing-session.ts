// signing-session.ts — typed, versioned signing request contract shared between UI and admin-api.
// v:1 field is MANDATORY; backend rejects any other version.
//
// EVM path:  EIP-712 SafeTx (Safe 1.4.1) — verified via ethers.verifyTypedData
// Solana path: fixed-order binary concat — verified via nacl.sign.detached.verify
import { z } from 'zod';

// ── EVM SafeTx domain and types (Safe 1.4.1 spec) ─────────────────────────────

const EvmDomainSchema = z.object({
  name: z.string(),
  version: z.string(),
  chainId: z.number().int().positive(),
  verifyingContract: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address'),
});

/** Safe 1.4.1 SafeTx message fields — all values as strings for portability. */
const EvmSafeTxMessageSchema = z.object({
  to: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address'),
  value: z.string(),
  data: z.string().regex(/^0x/, 'data must be 0x-prefixed hex'),
  operation: z.number().int().min(0).max(1),
  safeTxGas: z.string(),
  baseGas: z.string(),
  gasPrice: z.string(),
  gasToken: z.string(),
  refundReceiver: z.string(),
  nonce: z.string(),
});

/** EVM signing session wrapping a full EIP-712 Safe 1.4.1 SafeTx. */
export const SigningSessionEvm = z.object({
  v: z.literal(1),
  kind: z.literal('evm'),
  /** Address of the Safe multisig contract. */
  safeAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Safe address'),
  /** BNB chain ID (97 for testnet, 56 for mainnet). */
  chainId: z.number().int().positive(),
  /** Keccak256 hash of the SafeTx — used for broadcast. */
  safeTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid safeTxHash'),
  domain: EvmDomainSchema,
  message: EvmSafeTxMessageSchema,
});

export type SigningSessionEvm = z.infer<typeof SigningSessionEvm>;

// ── Solana canonical session ───────────────────────────────────────────────────

/** Token tag enum — single byte on-chain encoding. */
const SolanaTokenTag = z.enum(['USDT', 'USDC', 'SOL']);

/** Solana signing session — fields map 1:1 to canonical byte layout. */
export const SigningSessionSolana = z.object({
  v: z.literal(1),
  kind: z.literal('sol'),
  /** Squads multisig PDA — base58. */
  multisigPda: z.string().min(32).max(44),
  /** Wallet-Portal operation UUID (16 bytes when parsed). */
  opId: z.string().uuid(),
  /** Amount in token base units (e.g. USDT micro-units) as decimal string. */
  amount: z.string().regex(/^\d+$/, 'amount must be an integer string (base units)'),
  /** Token identifier. */
  tokenTag: SolanaTokenTag,
  /** Destination wallet — base58 pubkey (32 bytes). */
  destination: z.string().min(32).max(44),
  /** Replay-prevention nonce as decimal string (u64). */
  nonce: z.string().regex(/^\d+$/, 'nonce must be an integer string'),
});

export type SigningSessionSolana = z.infer<typeof SigningSessionSolana>;

// ── Union ──────────────────────────────────────────────────────────────────────

export const SigningSession = z.discriminatedUnion('kind', [
  SigningSessionEvm,
  SigningSessionSolana,
]);
export type SigningSession = z.infer<typeof SigningSession>;

// ── Canonical byte encoding (Solana) ──────────────────────────────────────────
// Layout (65 bytes fixed):
//   domain_tag  : 32 bytes — "wallet-portal-sign-v1" UTF-8, zero-padded to 32
//   opId        : 16 bytes — UUID parsed to raw bytes (MSB first / RFC 4122)
//   amount_u64  :  8 bytes — little-endian u64
//   token_u8    :  1 byte  — USDT=1, USDC=2, SOL=0
//   destination : 32 bytes — base58-decoded public key bytes
//   nonce_u64   :  8 bytes — little-endian u64
// Total: 97 bytes

const DOMAIN_TAG = 'wallet-portal-sign-v1';
const TOKEN_U8: Record<string, number> = { SOL: 0, USDT: 1, USDC: 2 };

/**
 * Parse a UUID string (with or without dashes) into 16 raw bytes.
 * RFC 4122 layout: fields stored MSB first.
 */
function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error(`[signing-session] invalid UUID: ${uuid}`);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Decode a base58-encoded Solana public key to 32 bytes.
 * Implements Bitcoin/Solana base58 alphabet without external deps.
 */
function base58ToBytes(encoded: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const alphabetMap = new Map<string, number>();
  for (let i = 0; i < ALPHABET.length; i++) {
    const ch = ALPHABET[i];
    if (ch !== undefined) alphabetMap.set(ch, i);
  }

  let value = 0n;
  for (const char of encoded) {
    const digit = alphabetMap.get(char);
    if (digit === undefined) throw new Error(`[signing-session] invalid base58 char: ${char}`);
    value = value * 58n + BigInt(digit);
  }

  // Convert bigint to big-endian bytes, then pad/trim to 32 bytes
  const result = new Uint8Array(32);
  let tmp = value;
  for (let i = 31; i >= 0 && tmp > 0n; i--) {
    result[i] = Number(tmp & 0xffn);
    tmp >>= 8n;
  }
  if (tmp !== 0n) throw new Error('[signing-session] base58 value exceeds 32 bytes');
  return result;
}

/**
 * Write a u64 value as 8 little-endian bytes into `buf` at `offset`.
 * Accepts bigint or number (auto-promoted).
 */
function writeU64Le(buf: Uint8Array, offset: number, value: bigint): void {
  let v = value;
  for (let i = 0; i < 8; i++) {
    buf[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

/**
 * Produce the 97-byte canonical message for a Solana signing session.
 * This is the ONLY bytes the signer should sign and the backend should verify.
 * Field ordering is deterministic — does NOT depend on JSON key order.
 */
export function canonicalSolanaBytes(session: SigningSessionSolana): Uint8Array {
  const buf = new Uint8Array(97);
  let offset = 0;

  // domain_tag: 32 bytes, UTF-8, zero-padded
  const tagBytes = new TextEncoder().encode(DOMAIN_TAG);
  if (tagBytes.length > 32) throw new Error('[signing-session] domain tag too long');
  buf.set(tagBytes, offset);
  offset += 32;

  // opId: 16 bytes (UUID → raw bytes)
  buf.set(uuidToBytes(session.opId), offset);
  offset += 16;

  // amount_u64_le: 8 bytes
  writeU64Le(buf, offset, BigInt(session.amount));
  offset += 8;

  // token_u8: 1 byte
  const tokenByte = TOKEN_U8[session.tokenTag];
  if (tokenByte === undefined)
    throw new Error(`[signing-session] unknown tokenTag: ${session.tokenTag}`);
  buf[offset] = tokenByte;
  offset += 1;

  // destination_32B: 32 bytes (base58 decoded pubkey)
  buf.set(base58ToBytes(session.destination), offset);
  offset += 32;

  // nonce_u64_le: 8 bytes
  writeU64Le(buf, offset, BigInt(session.nonce));
  // offset += 8; // final field, no need to advance

  return buf;
}
