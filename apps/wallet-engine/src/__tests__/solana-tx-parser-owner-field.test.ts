import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import bs58 from 'bs58';
// Bug 1 regression: owner field resolution and versioned tx (v0) format.
// Verifies that parseSplTransfers returns the wallet owner from postTokenBalances
// (not null, not the ATA address) and handles v0 compiledInstructions + loadedAddresses.
import { describe, expect, it } from 'vitest';
import { TOKEN_PROGRAM_ID, parseSplTransfers } from '../watcher/solana-tx-parser.js';
import {
  AUTHORITY,
  DST_ATA,
  SIG,
  SRC_ATA,
  USDC_MINT,
  USDT_MINT,
  makeTx,
} from './solana-tx-parser.fixtures.js';

const WALLET_ADDR = 'WalletOwner1111111111111111111111111111111111';

// ── owner field resolution (Bug 1) ───────────────────────────────────────────

describe('parseSplTransfers — owner field (ATA→wallet resolution)', () => {
  it('returns owner from postTokenBalances for Transfer (disc=3)', () => {
    const results = parseSplTransfers(makeTx(), 999, USDT_MINT, USDC_MINT);
    expect(results).toHaveLength(1);
    // makeTx sets postTokenBalance.owner = AUTHORITY
    expect(results[0]?.owner).toBe(AUTHORITY);
    expect(results[0]?.destination).toBe(DST_ATA);
    // owner must differ from destination to prove ATA→wallet distinction
    expect(results[0]?.owner).not.toBe(results[0]?.destination);
  });

  it('returns owner from postTokenBalances for TransferChecked (disc=12)', () => {
    const results = parseSplTransfers(
      makeTx({ disc: 'transferChecked', mint: USDT_MINT }),
      100,
      USDT_MINT,
      USDC_MINT
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.owner).toBe(AUTHORITY);
    expect(results[0]?.destination).toBe(DST_ATA);
  });

  it('returns null owner when postTokenBalances has no owner field', () => {
    const tx = makeTx() as unknown as {
      meta: { postTokenBalances: Array<Record<string, unknown>> };
    };
    for (const bal of tx.meta.postTokenBalances) {
      bal.owner = undefined;
    }
    const results = parseSplTransfers(
      tx as unknown as ParsedTransactionWithMeta,
      1,
      USDT_MINT,
      USDC_MINT
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.owner).toBeNull();
  });

  it('returns custom wallet address when postTokenBalances.owner differs from ATA', () => {
    const tx = makeTx() as unknown as {
      meta: { postTokenBalances: Array<Record<string, unknown>> };
    };
    for (const bal of tx.meta.postTokenBalances) {
      bal.owner = WALLET_ADDR;
    }
    const results = parseSplTransfers(
      tx as unknown as ParsedTransactionWithMeta,
      1,
      USDT_MINT,
      USDC_MINT
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.destination).toBe(DST_ATA);
    expect(results[0]?.owner).toBe(WALLET_ADDR);
  });
});

// ── Versioned tx (v0) support ─────────────────────────────────────────────────

/** Build a versioned tx fixture using compiledInstructions + accountKeyIndexes */
function makeVersionedTx(
  opts: {
    dataAsUint8Array?: boolean;
    withLoadedAddresses?: boolean;
  } = {}
): ParsedTransactionWithMeta {
  const amount = 2_000_000n;
  const programId = TOKEN_PROGRAM_ID;

  let accountKeys: string[];
  let loadedWritable: string[] | undefined;

  if (opts.withLoadedAddresses) {
    // Static: [programId, src, authority, mint] — dst is in loadedAddresses.writable
    accountKeys = [programId, SRC_ATA, AUTHORITY, USDT_MINT];
    loadedWritable = [DST_ATA];
  } else {
    accountKeys = [programId, SRC_ATA, DST_ATA, AUTHORITY, USDT_MINT];
  }

  // DST_ATA index in the full (static + loaded) key array
  const destIdx = opts.withLoadedAddresses ? 4 : 2;

  const buf = Buffer.alloc(9);
  buf.writeUInt8(3, 0);
  buf.writeBigUInt64LE(amount, 1);

  const rawData: string | Uint8Array = opts.dataAsUint8Array
    ? new Uint8Array(buf)
    : bs58.encode(buf);

  const compiledInstruction = {
    programIdIndex: 0,
    accountKeyIndexes: [1, destIdx, opts.withLoadedAddresses ? 2 : 3],
    data: rawData,
  };

  const postTokenBalances = [
    {
      accountIndex: destIdx,
      mint: USDT_MINT,
      uiTokenAmount: { amount: '2000000', decimals: 6, uiAmount: 2.0, uiAmountString: '2.0' },
      owner: WALLET_ADDR,
      programId: TOKEN_PROGRAM_ID,
    },
  ];

  const tx: unknown = {
    transaction: {
      signatures: [SIG],
      message: {
        accountKeys: accountKeys.map((pk) => ({ pubkey: { toBase58: () => pk } })),
        compiledInstructions: [compiledInstruction],
        recentBlockhash: 'blockhash',
      },
    },
    meta: {
      err: null,
      fee: 5000,
      innerInstructions: [],
      postTokenBalances,
      preTokenBalances: [],
      logMessages: [],
      ...(opts.withLoadedAddresses && loadedWritable
        ? { loadedAddresses: { writable: loadedWritable, readonly: [] } }
        : {}),
    },
    blockTime: 1700000000,
    slot: 999,
  };

  return tx as ParsedTransactionWithMeta;
}

describe('parseSplTransfers — versioned tx (v0) format', () => {
  it('parses versioned tx using compiledInstructions + accountKeyIndexes', () => {
    const results = parseSplTransfers(makeVersionedTx(), 999, USDT_MINT, USDC_MINT);
    expect(results).toHaveLength(1);
    expect(results[0]?.destination).toBe(DST_ATA);
    expect(results[0]?.amount).toBe(2_000_000n);
    expect(results[0]?.token).toBe('USDT');
  });

  it('parses versioned tx with data as Uint8Array (not base58 string)', () => {
    const results = parseSplTransfers(
      makeVersionedTx({ dataAsUint8Array: true }),
      999,
      USDT_MINT,
      USDC_MINT
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.destination).toBe(DST_ATA);
    expect(results[0]?.amount).toBe(2_000_000n);
  });

  it('resolves accounts from loadedAddresses.writable for versioned tx', () => {
    const results = parseSplTransfers(
      makeVersionedTx({ withLoadedAddresses: true }),
      999,
      USDT_MINT,
      USDC_MINT
    );
    expect(results).toHaveLength(1);
    // DST_ATA came from loadedAddresses.writable — must still be resolved correctly
    expect(results[0]?.destination).toBe(DST_ATA);
    expect(results[0]?.owner).toBe(WALLET_ADDR);
  });
});
