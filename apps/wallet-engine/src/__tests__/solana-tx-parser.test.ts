import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import bs58 from 'bs58';
// Unit tests for Solana SPL Transfer parser — golden fixture tx, no real RPC
import { describe, expect, it } from 'vitest';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  parseSplTransfers,
} from '../watcher/solana-tx-parser.js';

const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SRC_ATA = 'SrcTokenAccount111111111111111111111111111111';
const DST_ATA = 'DstTokenAccount111111111111111111111111111111';
const AUTHORITY = 'Authority111111111111111111111111111111111111';
const SIG = 'testSig1111111111111111111111111111111111111111111111111111111111';

/** Build base58-encoded SPL Transfer instruction data (disc=3, amount u64 LE) */
function encodeTransferData(amount: bigint): string {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(3, 0); // discriminator
  buf.writeBigUInt64LE(amount, 1); // amount
  return bs58.encode(buf);
}

/** Build base58-encoded SPL TransferChecked instruction data (disc=12, amount u64 LE, decimals) */
function encodeTransferCheckedData(amount: bigint, decimals = 6): string {
  const buf = Buffer.alloc(10);
  buf.writeUInt8(12, 0);
  buf.writeBigUInt64LE(amount, 1);
  buf.writeUInt8(decimals, 9);
  return bs58.encode(buf);
}

/** Build a minimal ParsedTransactionWithMeta fixture */
function makeTx(
  overrides: {
    programId?: string;
    disc?: 'transfer' | 'transferChecked';
    amount?: bigint;
    accountKeys?: string[];
    innerOnly?: boolean;
    mint?: string;
  } = {}
): ParsedTransactionWithMeta {
  const {
    programId = TOKEN_PROGRAM_ID,
    disc = 'transfer',
    amount = 1_000_000n,
    mint = USDT_MINT,
  } = overrides;

  // account keys: [tokenProgram, src, dst, authority, mint]
  const accountKeys = overrides.accountKeys ?? [programId, SRC_ATA, DST_ATA, AUTHORITY, mint];

  const data = disc === 'transfer' ? encodeTransferData(amount) : encodeTransferCheckedData(amount);

  const programIdIndex = 0;

  // Transfer instruction: accounts = [src=1, dst=2, authority=3]
  // TransferChecked:       accounts = [src=1, mint=4, dst=2, authority=3]
  const accounts = disc === 'transfer' ? [1, 2, 3] : [1, 4, 2, 3];

  const instruction = { programIdIndex, accounts, data };

  const postTokenBalances = [
    {
      accountIndex: 2, // dst index
      mint,
      uiTokenAmount: { amount: '1000000', decimals: 6, uiAmount: 1.0, uiAmountString: '1.0' },
      owner: AUTHORITY,
      programId: programId,
    },
  ];

  const tx: unknown = {
    transaction: {
      signatures: [SIG],
      message: {
        accountKeys: accountKeys.map((pk) => ({
          pubkey: { toBase58: () => pk },
          isSigner: false,
          isWritable: false,
        })),
        instructions: overrides.innerOnly ? [] : [instruction],
        recentBlockhash: 'blockhash',
      },
    },
    meta: {
      err: null,
      fee: 5000,
      innerInstructions: overrides.innerOnly ? [{ index: 0, instructions: [instruction] }] : [],
      postTokenBalances,
      preTokenBalances: [],
      logMessages: [],
    },
    blockTime: 1700000000,
    slot: 999,
  };

  return tx as ParsedTransactionWithMeta;
}

describe('parseSplTransfers — Transfer (disc=3)', () => {
  it('parses a USDT Transfer instruction', () => {
    const results = parseSplTransfers(makeTx(), 999, USDT_MINT, USDC_MINT);
    expect(results).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    const r = results[0] as NonNullable<(typeof results)[0]>;
    expect(r.token).toBe('USDT');
    expect(r.destination).toBe(DST_ATA);
    expect(r.amount).toBe(1_000_000n);
    expect(r.txHash).toBe(SIG);
    expect(r.slot).toBe(999);
    expect(r.mint).toBe(USDT_MINT);
  });

  it('parses a USDC Transfer instruction', () => {
    const results = parseSplTransfers(makeTx({ mint: USDC_MINT }), 100, USDT_MINT, USDC_MINT);
    expect(results).toHaveLength(1);
    expect(results[0]?.token).toBe('USDC');
  });

  it('ignores transfers for unrelated mints (no postTokenBalance match)', () => {
    const tx = makeTx({ mint: 'UnknownMint1111111111111111111111111111111111' });
    const results = parseSplTransfers(tx, 1, USDT_MINT, USDC_MINT);
    expect(results).toHaveLength(0);
  });

  it('ignores instructions from unrelated programs', () => {
    const tx = makeTx({ programId: 'SystemProgram1111111111111111111111111111111' });
    const results = parseSplTransfers(tx, 1, USDT_MINT, USDC_MINT);
    expect(results).toHaveLength(0);
  });

  it('parses inner instructions (CPI transfers)', () => {
    const results = parseSplTransfers(makeTx({ innerOnly: true }), 5, USDT_MINT, USDC_MINT);
    expect(results).toHaveLength(1);
    expect(results[0]?.slot).toBe(5);
  });

  it('returns empty array for tx with no signature', () => {
    const tx = makeTx() as unknown as { transaction: { signatures: string[] } };
    tx.transaction.signatures = [];
    const results = parseSplTransfers(
      tx as unknown as ParsedTransactionWithMeta,
      1,
      USDT_MINT,
      USDC_MINT
    );
    expect(results).toHaveLength(0);
  });
});

describe('parseSplTransfers — TransferChecked (disc=12)', () => {
  it('parses a TransferChecked instruction via Token2022', () => {
    const results = parseSplTransfers(
      makeTx({ programId: TOKEN_2022_PROGRAM_ID, disc: 'transferChecked', mint: USDC_MINT }),
      200,
      USDT_MINT,
      USDC_MINT
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.token).toBe('USDC');
    expect(results[0]?.amount).toBe(1_000_000n);
  });

  it('ignores TransferChecked for unknown mint', () => {
    const results = parseSplTransfers(
      makeTx({ disc: 'transferChecked', mint: 'SomethingElse111111111111111111111111111111' }),
      1,
      USDT_MINT,
      USDC_MINT
    );
    expect(results).toHaveLength(0);
  });
});
