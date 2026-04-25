import type { ParsedTransactionWithMeta, PublicKey } from '@solana/web3.js';
// Solana SPL token transfer parser
// Handles TokenProgram (Transfer=3) and Token2022 (TransferChecked=12).
// Matches destination token account against address registry for deposit detection.
import bs58 from 'bs58';
import pino from 'pino';

const logger = pino({ name: 'solana-tx-parser' });

export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** SPL Transfer discriminator (1 byte) */
const DISC_TRANSFER = 3;
/** SPL TransferChecked discriminator (1 byte) */
const DISC_TRANSFER_CHECKED = 12;

export type SplTokenSymbol = 'USDT' | 'USDC';

export interface ParsedSplTransfer {
  /** Destination token account public key (base58) — this is the ATA, not the wallet */
  destination: string;
  /** Wallet address that owns the destination ATA (from postTokenBalances) */
  owner: string | null;
  /** Raw token amount (u64, no decimal adjustment) */
  amount: bigint;
  txHash: string;
  slot: number;
  token: SplTokenSymbol;
  mint: string;
}

/** Decode base58 instruction data to Buffer; null on failure */
function decodeIxData(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  try {
    return Buffer.from(bs58.decode(raw));
  } catch {
    return null;
  }
}

/** Read u64 LE from offset 1 of a Transfer instruction buffer */
function readAmount(buf: Buffer, offset = 1): bigint | null {
  if (buf.length < offset + 8) return null;
  return buf.readBigUInt64LE(offset);
}

/** Resolve account key string from pre-flattened key array */
function resolveAccountKey(accountKeys: string[], idx: number): string | null {
  const k = accountKeys[idx];
  return k && k.length > 0 ? k : null;
}

/** Resolve mint from post-token balances by destination account index */
function resolveMint(
  tx: ParsedTransactionWithMeta,
  destIndex: number,
  usdtMint: string,
  usdcMint: string
): string | null {
  for (const bal of tx.meta?.postTokenBalances ?? []) {
    if (bal.accountIndex === destIndex) {
      if (bal.mint === usdtMint || bal.mint === usdcMint) return bal.mint;
    }
  }
  return null;
}

/** Resolve wallet owner of an ATA from postTokenBalances */
function resolveOwner(tx: ParsedTransactionWithMeta, destIndex: number): string | null {
  for (const bal of tx.meta?.postTokenBalances ?? []) {
    if (bal.accountIndex === destIndex) {
      return (bal as { owner?: string | null }).owner ?? null;
    }
  }
  return null;
}

interface RawInstruction {
  programIdIndex: number;
  accounts?: number[];
  accountKeyIndexes?: number[];
  data?: string | Uint8Array;
}

function normaliseIx(ix: RawInstruction): {
  programIdIndex: number;
  accounts: number[];
  data: string | undefined;
} {
  const accounts = ix.accounts ?? ix.accountKeyIndexes ?? [];
  let data: string | undefined;
  if (ix.data instanceof Uint8Array) {
    data = bs58.encode(ix.data);
  } else {
    data = ix.data;
  }
  return { programIdIndex: ix.programIdIndex, accounts, data };
}

/**
 * Parse all SPL Transfer / TransferChecked instructions in a transaction.
 * Returns one entry per matched instruction that involves USDT or USDC.
 */
export function parseSplTransfers(
  tx: ParsedTransactionWithMeta,
  slot: number,
  usdtMint: string,
  usdcMint: string
): ParsedSplTransfer[] {
  const sig = tx.transaction.signatures[0];
  if (!sig) return [];

  // Build full account key list: static keys + address lookup table entries
  type AccountKeyLike =
    | string
    | { pubkey?: { toBase58?: () => string }; toBase58?: () => string; toString?: () => string };
  type LoadedAddresses = { writable?: AccountKeyLike[]; readonly?: AccountKeyLike[] };
  type MessageWithKeys = {
    accountKeys?: AccountKeyLike[];
    instructions?: unknown[];
    compiledInstructions?: unknown[];
  };
  const toKeyString = (k: AccountKeyLike): string =>
    typeof k === 'string'
      ? k
      : (k?.pubkey?.toBase58?.() ?? k?.toBase58?.() ?? k?.toString?.() ?? '');

  const message = tx.transaction.message as unknown as MessageWithKeys;
  const staticKeys: string[] = (message.accountKeys ?? []).map(toKeyString);
  const loaded = (tx.meta as unknown as { loadedAddresses?: LoadedAddresses })?.loadedAddresses;
  const loadedWritable: string[] = (loaded?.writable ?? []).map(toKeyString);
  const loadedReadonly: string[] = (loaded?.readonly ?? []).map(toKeyString);
  const accountKeys: string[] = [...staticKeys, ...loadedWritable, ...loadedReadonly];
  const results: ParsedSplTransfer[] = [];

  // Flatten top-level + inner instructions (handle both legacy and versioned tx formats)
  const rawTopLevel = message.instructions ?? message.compiledInstructions ?? [];
  const topLevel = Array.isArray(rawTopLevel) ? (rawTopLevel as RawInstruction[]) : [];
  const inner = (tx.meta?.innerInstructions ?? []).flatMap((ii) => {
    const ixs = ii.instructions;
    return Array.isArray(ixs) ? (ixs as unknown as RawInstruction[]) : [];
  });
  const allIxs: RawInstruction[] = [...topLevel, ...inner];

  for (const rawIx of allIxs) {
    const ix = normaliseIx(rawIx);
    const programId = resolveAccountKey(accountKeys, ix.programIdIndex);
    if (programId !== TOKEN_PROGRAM_ID && programId !== TOKEN_2022_PROGRAM_ID) continue;

    const data = decodeIxData(ix.data);
    if (!data || data.length < 1) continue;

    const disc = data[0];

    if (disc === DISC_TRANSFER) {
      // accounts: [source(0), destination(1), authority(2)]
      const destIdx = ix.accounts[1];
      if (destIdx === undefined) continue;
      const destination = resolveAccountKey(accountKeys, destIdx);
      if (!destination) continue;

      const amount = readAmount(data);
      if (amount === null) continue;

      const mint = resolveMint(tx, destIdx, usdtMint, usdcMint);
      if (!mint) continue;

      const owner = resolveOwner(tx, destIdx);
      const token: SplTokenSymbol = mint === usdtMint ? 'USDT' : 'USDC';
      results.push({ destination, owner, amount, txHash: sig, slot, token, mint });
    } else if (disc === DISC_TRANSFER_CHECKED) {
      // accounts: [source(0), mint(1), destination(2), authority(3)]
      const mintIdx = ix.accounts[1];
      const destIdx = ix.accounts[2];
      if (mintIdx === undefined || destIdx === undefined) continue;

      const mintAddr = resolveAccountKey(accountKeys, mintIdx);
      const destination = resolveAccountKey(accountKeys, destIdx);
      if (!mintAddr || !destination) continue;
      if (mintAddr !== usdtMint && mintAddr !== usdcMint) continue;

      const amount = readAmount(data);
      if (amount === null) continue;

      const owner = resolveOwner(tx, destIdx);
      const token: SplTokenSymbol = mintAddr === usdtMint ? 'USDT' : 'USDC';
      results.push({ destination, owner, amount, txHash: sig, slot, token, mint: mintAddr });
    }
  }

  if (results.length > 0) {
    logger.debug({ slot, sig, count: results.length }, 'SPL transfers parsed');
  }

  return results;
}
