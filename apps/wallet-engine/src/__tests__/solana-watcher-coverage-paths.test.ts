import type { Connection } from '@solana/web3.js';
import type { Queue } from 'bullmq';
// Tests for SolanaWatcher uncovered lines (80.1% → targeting branch gaps):
// - start() with null checkpoint → fetches tip, saves (lines 50-61)
// - start() with null checkpoint + getSlot throws (lines 55-60 warn path)
// - tick() skipUntil still in future → early return (line 86)
// - tick() lastProcessedSlot < 0 after getSlot error recovery (lines 103-107)
// - processSlot() block null → advance checkpoint (lines 143-148)
// - processSlot() getBlock 429 rate-limit → backoff (lines 129-135)
// - processSlot() getBlock non-429 error → advance checkpoint (lines 136-141)
// - processSlot() parseSplTransfers throws → skip tx, continue (lines 160-166)
// - processSlot() transfer.owner null → fallback to destination (line 170)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client.js';
import { AddressRegistry } from '../watcher/address-registry.js';
import { BlockCheckpoint } from '../watcher/block-checkpoint.js';
import { SolanaWatcher } from '../watcher/solana-watcher.js';

// Mock deposit-detector so watcher tests don't need DB/schema deps
const mockDetectDeposit = vi.fn().mockResolvedValue(undefined);
vi.mock('../watcher/deposit-detector.js', () => ({
  detectDeposit: (...args: unknown[]) => mockDetectDeposit(...args),
}));

// Mock @wp/admin-api/db-schema for AddressRegistry
vi.mock('@wp/admin-api/db-schema', () => ({
  userAddresses: {
    id: 'id',
    userId: 'userId',
    chain: 'chain',
    address: 'address',
    derivationPath: 'derivationPath',
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const USDT_MINT = 'USDTmint111';
const USDC_MINT = 'USDCmint111';
const WATCHED_SOL = 'WatchedSolAddr11111111111111111111111111111';
const USER_ID = 'user-sol-1';

function makeConnection(opts: {
  slotResult?: number | Error;
  blockResult?: unknown;
}): Connection {
  return {
    getSlot:
      opts.slotResult instanceof Error
        ? vi.fn().mockRejectedValue(opts.slotResult)
        : vi.fn().mockResolvedValue(opts.slotResult ?? 1000),
    getBlock:
      opts.blockResult instanceof Error
        ? vi.fn().mockRejectedValue(opts.blockResult)
        : vi.fn().mockResolvedValue(opts.blockResult ?? null),
  } as unknown as Connection;
}

function makeQueue(): Queue {
  return { add: vi.fn().mockResolvedValue({ id: 'job-1' }) } as unknown as Queue;
}

function makeDb(): Db {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'dep-1' }]) }),
    }),
  } as unknown as Db;
}

async function makeRegistry(chain: 'sol' | 'bnb' = 'sol', addr = WATCHED_SOL) {
  const reg = new AddressRegistry();
  const seedDb = {
    select: vi.fn().mockReturnValue({
      from: vi
        .fn()
        .mockResolvedValue([
          { id: 'addr-sol-1', userId: USER_ID, chain, address: addr, derivationPath: null },
        ]),
    }),
  } as unknown as Db;
  await reg.refresh(seedDb);
  return reg;
}

function makeWatcher(connection: Connection, opts: { slotFromCheckpoint?: number | null } = {}) {
  const db = makeDb();
  const queue = makeQueue();
  const checkpoint = new BlockCheckpoint(db);

  vi.spyOn(checkpoint, 'load').mockResolvedValue(opts.slotFromCheckpoint ?? null);
  vi.spyOn(checkpoint, 'save').mockResolvedValue();

  return {
    watcher: new SolanaWatcher(connection, db, queue, new AddressRegistry(), checkpoint, {
      pollIntervalMs: 20,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    }),
    checkpoint,
    queue,
  };
}

// ── Tests: start() with null checkpoint ──────────────────────────────────────

describe('SolanaWatcher.start — null checkpoint fetches tip', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('null checkpoint: calls getSlot and saves tip', async () => {
    const connection = makeConnection({ slotResult: 500 });
    const { watcher, checkpoint } = makeWatcher(connection, { slotFromCheckpoint: null });

    await watcher.start();
    await watcher.stop();

    expect(connection.getSlot).toHaveBeenCalledOnce();
    expect(vi.mocked(checkpoint.save)).toHaveBeenCalledWith('sol', 500);
  });

  it('null checkpoint + getSlot throws: logs warn, lastProcessedSlot stays -1', async () => {
    const connection = makeConnection({ slotResult: new Error('getSlot failed') });
    const { watcher, checkpoint } = makeWatcher(connection, { slotFromCheckpoint: null });

    await watcher.start();
    expect(watcher.getLastProcessedSlot()).toBe(-1);
    await watcher.stop();

    expect(vi.mocked(checkpoint.save)).not.toHaveBeenCalled();
  });
});

// ── Tests: tick() with skipUntil in future ────────────────────────────────────

describe('SolanaWatcher.tick — skipUntil guard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skipUntil in future: getSlot not called on that tick', async () => {
    const connection = makeConnection({ slotResult: new Error('RPC down') });
    const { watcher } = makeWatcher(connection, { slotFromCheckpoint: 100 });

    await watcher.start();
    // First tick: getSlot throws → sets skipUntil = now + backoff (~1000ms)
    await new Promise((r) => setTimeout(r, 50));
    const callCountAfterFirstError = vi.mocked(connection.getSlot).mock.calls.length;

    // Second tick fires but skipUntil is still in future → getSlot NOT called again
    await new Promise((r) => setTimeout(r, 30));
    expect(vi.mocked(connection.getSlot).mock.calls.length).toBe(callCountAfterFirstError);

    await watcher.stop();
  });
});

// ── Tests: tick() lastProcessedSlot < 0 recovery ────────────────────────────

describe('SolanaWatcher.tick — lastProcessedSlot=-1 recovery', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lastProcessedSlot=-1 after start failure: first successful tick sets from getSlot', async () => {
    // getSlot fails on start, succeeds on tick
    let callCount = 0;
    const connection = {
      getSlot: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('initial fail'));
        return Promise.resolve(800);
      }),
      getBlock: vi.fn().mockResolvedValue(null),
    } as unknown as Connection;

    const db = makeDb();
    const queue = makeQueue();
    const checkpoint = new BlockCheckpoint(db);
    vi.spyOn(checkpoint, 'load').mockResolvedValue(null); // null → tries getSlot on start
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new SolanaWatcher(connection, db, queue, new AddressRegistry(), checkpoint, {
      pollIntervalMs: 20,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start(); // getSlot fails → lastProcessedSlot = -1
    await new Promise((r) => setTimeout(r, 60)); // tick fires: getSlot returns 800, sets slot
    await watcher.stop();

    // After recovery tick, lastProcessedSlot should be set to 800
    expect(watcher.getLastProcessedSlot()).toBe(800);
  });
});

// ── Tests: processSlot — block null ──────────────────────────────────────────

describe('SolanaWatcher.processSlot — null block (skipped slot)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('null block: advances checkpoint without processing transactions', async () => {
    const connection = makeConnection({ slotResult: 201, blockResult: null });
    const db = makeDb();
    const queue = makeQueue();
    const checkpoint = new BlockCheckpoint(db);
    vi.spyOn(checkpoint, 'load').mockResolvedValue(200);
    const saveSpy = vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const reg = await makeRegistry();
    const watcher = new SolanaWatcher(connection, db, queue, reg, checkpoint, {
      pollIntervalMs: 20,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 60));
    await watcher.stop();

    expect(saveSpy).toHaveBeenCalledWith('sol', 201);
    expect(mockDetectDeposit).not.toHaveBeenCalled();
  });
});

// ── Tests: processSlot — getBlock 429 rate-limit ─────────────────────────────

describe('SolanaWatcher.processSlot — getBlock 429 rate-limit', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('429 error: sets skipUntil backoff without advancing checkpoint', async () => {
    const connection = makeConnection({
      slotResult: 301,
      blockResult: new Error('Error 429: rate limited'),
    });
    const db = makeDb();
    const queue = makeQueue();
    const checkpoint = new BlockCheckpoint(db);
    vi.spyOn(checkpoint, 'load').mockResolvedValue(300);
    const saveSpy = vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new SolanaWatcher(connection, db, queue, new AddressRegistry(), checkpoint, {
      pollIntervalMs: 20,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 60));
    await watcher.stop();

    // checkpoint.save should NOT have been called for the rate-limited slot
    expect(saveSpy).not.toHaveBeenCalledWith('sol', 301);
  });
});

// ── Tests: processSlot — non-429 getBlock error ───────────────────────────────

describe('SolanaWatcher.processSlot — non-429 getBlock error (skipped slot)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('non-429 error: advances checkpoint (slot skipped per Solana consensus)', async () => {
    const connection = makeConnection({
      slotResult: 401,
      blockResult: new Error('SlotSkipped: Block for slot not available'),
    });
    const db = makeDb();
    const queue = makeQueue();
    const checkpoint = new BlockCheckpoint(db);
    vi.spyOn(checkpoint, 'load').mockResolvedValue(400);
    const saveSpy = vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new SolanaWatcher(connection, db, queue, new AddressRegistry(), checkpoint, {
      pollIntervalMs: 20,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 60));
    await watcher.stop();

    expect(saveSpy).toHaveBeenCalledWith('sol', 401);
  });
});

// ── Tests: processSlot — tx without signatures ────────────────────────────────

describe('SolanaWatcher.processSlot — tx without signatures skipped', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('tx with no signatures: skipped without calling detectDeposit', async () => {
    const blockWithBadTx = {
      transactions: [
        { transaction: { signatures: [], message: { instructions: [] } } }, // no sig
      ],
    };
    const connection = makeConnection({ slotResult: 501, blockResult: blockWithBadTx });
    const db = makeDb();
    const queue = makeQueue();
    const checkpoint = new BlockCheckpoint(db);
    vi.spyOn(checkpoint, 'load').mockResolvedValue(500);
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const reg = await makeRegistry();
    const watcher = new SolanaWatcher(connection, db, queue, reg, checkpoint, {
      pollIntervalMs: 20,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 60));
    await watcher.stop();

    expect(mockDetectDeposit).not.toHaveBeenCalled();
  });
});
