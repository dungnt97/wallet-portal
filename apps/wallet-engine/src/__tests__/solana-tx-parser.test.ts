import type { ParsedTransactionWithMeta } from '@solana/web3.js';
// Unit tests for Solana SPL Transfer parser — golden fixture tx, no real RPC
import { describe, expect, it } from 'vitest';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  parseSplTransfers,
} from '../watcher/solana-tx-parser.js';
import {
  AUTHORITY,
  DST_ATA,
  SIG,
  SRC_ATA,
  USDC_MINT,
  USDT_MINT,
  makeTx,
} from './solana-tx-parser.fixtures.js';

describe('parseSplTransfers — Transfer (disc=3)', () => {
  it('parses a USDT Transfer instruction', () => {
    const results = parseSplTransfers(makeTx(), 999, USDT_MINT, USDC_MINT);
    expect(results).toHaveLength(1);
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
