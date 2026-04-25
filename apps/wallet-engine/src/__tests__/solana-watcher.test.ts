import type { Connection } from '@solana/web3.js';
import type { Queue } from 'bullmq';
// Integration test for SolanaWatcher — mock Connection, no real RPC
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client.js';
import { AddressRegistry } from '../watcher/address-registry.js';
import { BlockCheckpoint } from '../watcher/block-checkpoint.js';
import { SolanaWatcher } from '../watcher/solana-watcher.js';
import {
  AUTHORITY,
  DST_ATA,
  SIG,
  SRC_ATA,
  USDC_MINT,
  USDT_MINT,
  USER_ID,
  WALLET_ADDR,
  makeBlock,
  makeDb,
  makeQueue,
} from './solana-watcher.fixtures.js';

describe('SolanaWatcher', () => {
  let db: Db;
  let queue: Queue;
  let checkpoint: BlockCheckpoint;
  let registry: AddressRegistry;

  beforeEach(async () => {
    db = makeDb();
    queue = makeQueue();
    checkpoint = new BlockCheckpoint(db);

    registry = new AddressRegistry();
    // Bug 1 fix: registry must store WALLET_ADDR (the wallet), not DST_ATA (the ATA).
    // The watcher resolves ATA→wallet via transfer.owner and looks up the wallet address.
    const seedDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue([
          {
            id: 'addr-sol-1',
            userId: USER_ID,
            chain: 'sol',
            address: WALLET_ADDR,
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

  it('processes slot and enqueues job when destination matches registry', async () => {
    const connection = {
      getSlot: vi.fn().mockResolvedValue(101),
      getBlock: vi.fn().mockResolvedValue(makeBlock(101)),
    } as unknown as Connection;

    vi.spyOn(checkpoint, 'load').mockResolvedValue(100);
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new SolanaWatcher(connection, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 80));
    await watcher.stop();

    expect(connection.getBlock).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ maxSupportedTransactionVersion: 0 })
    );
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('skips enqueue when neither ATA destination nor wallet owner is in registry', async () => {
    // Both the destination ATA and the postTokenBalances.owner are unknown addresses.
    // The watcher looks up transfer.owner first (bug-fix behaviour), then falls back to
    // transfer.destination — neither is in the registry, so no job is enqueued.
    const block = makeBlock(
      200,
      'UnknownATA111111111111111111111111111111111',
      'UnknownWallet1111111111111111111111111111111'
    );
    const connection = {
      getSlot: vi.fn().mockResolvedValue(200),
      getBlock: vi.fn().mockResolvedValue(block),
    } as unknown as Connection;

    vi.spyOn(checkpoint, 'load').mockResolvedValue(199);
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new SolanaWatcher(connection, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 80));
    await watcher.stop();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('handles null block (skipped slot) without error', async () => {
    const connection = {
      getSlot: vi.fn().mockResolvedValue(300),
      getBlock: vi.fn().mockResolvedValue(null),
    } as unknown as Connection;

    vi.spyOn(checkpoint, 'load').mockResolvedValue(299);
    const saveSpy = vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new SolanaWatcher(connection, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 80));
    await watcher.stop();

    expect(queue.add).not.toHaveBeenCalled();
    // Checkpoint still advances past skipped slot
    expect(saveSpy).toHaveBeenCalledWith('sol', 300);
  });

  it('handles getSlot error gracefully without throwing', async () => {
    const connection = {
      getSlot: vi.fn().mockRejectedValue(new Error('Solana RPC down')),
      getBlock: vi.fn(),
    } as unknown as Connection;

    vi.spyOn(checkpoint, 'load').mockResolvedValue(50);
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new SolanaWatcher(connection, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 120));
    await expect(watcher.stop()).resolves.not.toThrow();

    expect(connection.getBlock).not.toHaveBeenCalled();
  });

  it('saves checkpoint after processing each slot', async () => {
    const connection = {
      getSlot: vi.fn().mockResolvedValue(401),
      getBlock: vi.fn().mockResolvedValue(makeBlock(401)),
    } as unknown as Connection;

    vi.spyOn(checkpoint, 'load').mockResolvedValue(400);
    const saveSpy = vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new SolanaWatcher(connection, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 80));
    await watcher.stop();

    expect(saveSpy).toHaveBeenCalledWith('sol', 401);
  });
});
