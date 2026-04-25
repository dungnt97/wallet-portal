import type { Connection } from '@solana/web3.js';
import type { Queue } from 'bullmq';
// Bug 1 regression: SolanaWatcher must look up transfer.owner (wallet) not transfer.destination (ATA).
// These tests FAIL if the watcher reverts to using transfer.destination for registry lookup.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client.js';
import { AddressRegistry } from '../watcher/address-registry.js';
import { BlockCheckpoint } from '../watcher/block-checkpoint.js';
import { SolanaWatcher } from '../watcher/solana-watcher.js';
import {
  DST_ATA,
  USDC_MINT,
  USDT_MINT,
  USER_ID,
  WALLET_ADDR,
  makeBlock,
  makeDb,
  makeQueue,
} from './solana-watcher.fixtures.js';

/** Seed AddressRegistry with a single sol address */
async function seedRegistry(address: string): Promise<AddressRegistry> {
  const reg = new AddressRegistry();
  const seedDb = {
    select: vi.fn().mockReturnValue({
      from: vi
        .fn()
        .mockResolvedValue([
          { id: 'addr-x', userId: USER_ID, chain: 'sol', address, derivationPath: null },
        ]),
    }),
  } as unknown as Db;
  await reg.refresh(seedDb);
  return reg;
}

describe('SolanaWatcher — ATA→wallet resolution (Bug 1 regression)', () => {
  let db: Db;
  let queue: Queue;
  let checkpoint: BlockCheckpoint;

  beforeEach(() => {
    db = makeDb();
    queue = makeQueue();
    checkpoint = new BlockCheckpoint(db);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('enqueues deposit when registry has wallet address and transfer.owner resolves it', async () => {
    // Registry contains WALLET_ADDR (not DST_ATA)
    const registry = await seedRegistry(WALLET_ADDR);

    // Block: destination=DST_ATA, postTokenBalances.owner=WALLET_ADDR
    const block = makeBlock(500, DST_ATA, WALLET_ADDR);
    const connection = {
      getSlot: vi.fn().mockResolvedValue(501),
      getBlock: vi.fn().mockResolvedValue(block),
    } as unknown as Connection;

    vi.spyOn(checkpoint, 'load').mockResolvedValue(500);
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new SolanaWatcher(connection, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 80));
    await watcher.stop();

    // Watcher must resolve ATA→wallet via transfer.owner and match the registry entry
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('stores wallet address (not ATA) as the to field in the enqueued deposit job', async () => {
    const registry = await seedRegistry(WALLET_ADDR);

    const block = makeBlock(600, DST_ATA, WALLET_ADDR);
    const connection = {
      getSlot: vi.fn().mockResolvedValue(601),
      getBlock: vi.fn().mockResolvedValue(block),
    } as unknown as Connection;

    vi.spyOn(checkpoint, 'load').mockResolvedValue(600);
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new SolanaWatcher(connection, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 80));
    await watcher.stop();

    expect(queue.add).toHaveBeenCalledTimes(1);
    // Deposit job data must NOT reference the ATA as the recipient
    const jobData = (queue.add as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    expect(jobData).toBeDefined();
    expect(jobData).not.toMatchObject({ to: DST_ATA });
  });

  it('falls back to destination (ATA) when owner is null and destination is in registry', async () => {
    // Fallback path: no owner in postTokenBalances → watcher uses transfer.destination
    const registry = await seedRegistry(DST_ATA);

    const block = makeBlock(700, DST_ATA, DST_ATA);
    // Remove owner to simulate null
    const txMeta = block.transactions[0]?.meta as {
      postTokenBalances: Array<Record<string, unknown>>;
    };
    for (const bal of txMeta.postTokenBalances) {
      bal.owner = undefined;
    }

    const connection = {
      getSlot: vi.fn().mockResolvedValue(701),
      getBlock: vi.fn().mockResolvedValue(block),
    } as unknown as Connection;

    vi.spyOn(checkpoint, 'load').mockResolvedValue(700);
    vi.spyOn(checkpoint, 'save').mockResolvedValue();

    const watcher = new SolanaWatcher(connection, db, queue, registry, checkpoint, {
      pollIntervalMs: 50,
      usdtMint: USDT_MINT,
      usdcMint: USDC_MINT,
    });

    await watcher.start();
    await new Promise((r) => setTimeout(r, 80));
    await watcher.stop();

    // DST_ATA is in registry; owner null → fallback to destination → match
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('does NOT enqueue when registry only has ATA (not wallet) and owner is set', async () => {
    // Regression guard: if someone reverts the fix so the watcher registers ATAs instead of
    // wallet addresses, this test catches it. Registry has DST_ATA; block.owner=WALLET_ADDR.
    // Watcher looks up WALLET_ADDR first (transfer.owner) — no match → no job.
    const registry = await seedRegistry(DST_ATA);

    const block = makeBlock(800, DST_ATA, WALLET_ADDR);
    const connection = {
      getSlot: vi.fn().mockResolvedValue(801),
      getBlock: vi.fn().mockResolvedValue(block),
    } as unknown as Connection;

    vi.spyOn(checkpoint, 'load').mockResolvedValue(800);
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
});
