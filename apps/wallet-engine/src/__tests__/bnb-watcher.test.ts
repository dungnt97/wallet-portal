import type { Queue } from 'bullmq';
import type { FallbackProvider, Log } from 'ethers';
// Integration test for BnbWatcher — mock FallbackProvider, no real RPC
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client.js';
import { AddressRegistry } from '../watcher/address-registry.js';
import { BlockCheckpoint } from '../watcher/block-checkpoint.js';
import { TRANSFER_TOPIC } from '../watcher/bnb-log-parser.js';
import { BnbWatcher } from '../watcher/bnb-watcher.js';

const USDT = '0x55d398326f99059fF775485246999027B3197955';
const USDC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
const WATCHED = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const USER_ID = 'user-abc';

/** Build a mock FallbackProvider */
function makeProvider(opts: {
  blockNumber: number;
  logs: Partial<Log>[];
}): FallbackProvider {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(opts.blockNumber),
    getLogs: vi.fn().mockResolvedValue(opts.logs),
  } as unknown as FallbackProvider;
}

/** Build a Transfer log pointing to WATCHED address */
function makeTransferLog(to: string, blockNumber = 10): Partial<Log> {
  return {
    address: USDT,
    blockNumber,
    transactionHash: `0xtx${blockNumber}`,
    index: 0,
    topics: [
      TRANSFER_TOPIC,
      '0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      `0x000000000000000000000000${to.slice(2).padStart(40, '0')}`,
    ],
    data: `0x${'0'.repeat(63)}1`, // amount = 1
  };
}

/** Build a no-op DB mock (checkpoint load returns null, save is no-op) */
function makeDb(): Db {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
        returning: vi.fn().mockResolvedValue([{ id: 'deposit-1' }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(1) }),
    }),
  } as unknown as Db;
}

/** Build a mock BullMQ Queue */
function makeQueue(): Queue {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  } as unknown as Queue;
}

/** Build AddressRegistry with WATCHED pre-loaded */
function makeRegistry(): AddressRegistry {
  const reg = new AddressRegistry();
  // Inject entry directly via refresh-with-mock-db
  const mockDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([
        {
          id: 'addr-1',
          userId: USER_ID,
          chain: 'bnb',
          address: WATCHED,
          derivationPath: null,
        },
      ]),
    }),
  } as unknown as Db;
  // Synchronously seed the private map via refresh (returns promise — we'll await in test setup)
  (reg as unknown as { _seedDb: Db })._seedDb = mockDb;
  return reg;
}

describe('BnbWatcher', () => {
  let db: Db;
  let queue: Queue;
  let checkpoint: BlockCheckpoint;
  let registry: AddressRegistry;

  beforeEach(async () => {
    db = makeDb();
    queue = makeQueue();
    checkpoint = new BlockCheckpoint(db);

    registry = new AddressRegistry();
    // Seed registry with watched address
    const seedDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue([
          {
            id: 'addr-1',
            userId: USER_ID,
            chain: 'bnb',
            address: WATCHED,
            derivationPath: null,
          },
        ]),
      }),
    } as unknown as Db;
    await registry.refresh(seedDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('processes 3 blocks and enqueues job for matching Transfer log', async () => {
    // Provider returns block 12 as tip; checkpoint starts at 9 → processes 10,11,12
    const provider = makeProvider({
      blockNumber: 12,
      logs: [makeTransferLog(WATCHED, 10)],
    });

    // Preload checkpoint at block 9
    vi.spyOn(checkpoint, 'load').mockResolvedValue(9);
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new BnbWatcher(provider, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtAddress: USDT,
      usdcAddress: USDC,
    });

    await watcher.start();
    // Wait for one tick
    await new Promise((r) => setTimeout(r, 80));
    await watcher.stop();

    expect(provider.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: 10, toBlock: 12 })
    );
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('does not enqueue when Transfer recipient is not in registry', async () => {
    const provider = makeProvider({
      blockNumber: 11,
      logs: [makeTransferLog('0x1111111111111111111111111111111111111111', 11)],
    });

    vi.spyOn(checkpoint, 'load').mockResolvedValue(10);
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new BnbWatcher(provider, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtAddress: USDT,
      usdcAddress: USDC,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 80));
    await watcher.stop();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('clamps catch-up to MAX_BLOCKS_PER_TICK (100)', async () => {
    // Tip is 200 blocks ahead of checkpoint
    const provider = makeProvider({ blockNumber: 200, logs: [] });
    vi.spyOn(checkpoint, 'load').mockResolvedValue(0);
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new BnbWatcher(provider, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtAddress: USDT,
      usdcAddress: USDC,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 80));
    await watcher.stop();

    // getLogs called with toBlock capped at fromBlock + 99 = 100
    expect(provider.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: 1, toBlock: 100 })
    );
  });

  it('saves checkpoint after processing', async () => {
    const provider = makeProvider({ blockNumber: 5, logs: [] });
    vi.spyOn(checkpoint, 'load').mockResolvedValue(4);
    const saveSpy = vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new BnbWatcher(provider, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtAddress: USDT,
      usdcAddress: USDC,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 80));
    await watcher.stop();

    expect(saveSpy).toHaveBeenCalledWith('bnb', 5);
  });

  it('does not call getLogs when no new blocks', async () => {
    const provider = makeProvider({ blockNumber: 10, logs: [] });
    vi.spyOn(checkpoint, 'load').mockResolvedValue(10);
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new BnbWatcher(provider, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtAddress: USDT,
      usdcAddress: USDC,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 80));
    await watcher.stop();

    expect(provider.getLogs).not.toHaveBeenCalled();
  });

  it('continues after getBlockNumber error (no throw)', async () => {
    const provider = {
      getBlockNumber: vi.fn().mockRejectedValue(new Error('RPC down')),
      getLogs: vi.fn().mockResolvedValue([]),
    } as unknown as FallbackProvider;

    vi.spyOn(checkpoint, 'load').mockResolvedValue(10);
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new BnbWatcher(provider, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtAddress: USDT,
      usdcAddress: USDC,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 120));
    await expect(watcher.stop()).resolves.not.toThrow();
  });
});
