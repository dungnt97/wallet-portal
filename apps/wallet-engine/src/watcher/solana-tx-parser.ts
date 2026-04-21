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
  /** Destination token account public key (base58) */
  destination: string;
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

/** Resolve account key string from parsed message */
function resolveAccountKey(
  accountKeys: Array<string | { pubkey: PublicKey }>,
  idx: number
): string | null {
  const k = accountKeys[idx];
  if (!k) return null;
  return typeof k === 'string' ? k : k.pubkey.toBase58();
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

interface RawInstruction {
  programIdIndex: number;
  accounts: number[];
  data?: string;
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

  const { accountKeys } = tx.transaction.message;
  const results: ParsedSplTransfer[] = [];

  // Flatten top-level + inner instructions
  const topLevel = tx.transaction.message.instructions as unknown as RawInstruction[];
  const inner = (tx.meta?.innerInstructions ?? []).flatMap(
    (ii) => ii.instructions as unknown as RawInstruction[]
  );
  const allIxs: RawInstruction[] = [...topLevel, ...inner];

  for (const ix of allIxs) {
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

      const token: SplTokenSymbol = mint === usdtMint ? 'USDT' : 'USDC';
      results.push({ destination, amount, txHash: sig, slot, token, mint });
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

      const token: SplTokenSymbol = mintAddr === usdtMint ? 'USDT' : 'USDC';
      results.push({ destination, amount, txHash: sig, slot, token, mint: mintAddr });
    }
  }

  if (results.length > 0) {
    logger.debug({ slot, sig, count: results.length }, 'SPL transfers parsed');
  }

  return results;
}
