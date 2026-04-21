import type { Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import type { Queue } from 'bullmq';
// Integration test for SolanaWatcher — mock Connection, no real RPC
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client.js';
import { AddressRegistry } from '../watcher/address-registry.js';
import { BlockCheckpoint } from '../watcher/block-checkpoint.js';
import { TOKEN_PROGRAM_ID } from '../watcher/solana-tx-parser.js';
import { SolanaWatcher } from '../watcher/solana-watcher.js';

const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const DST_ATA = 'DstTokenAccount111111111111111111111111111111';
const SRC_ATA = 'SrcTokenAccount111111111111111111111111111111';
const AUTHORITY = 'Authority111111111111111111111111111111111111';
const USER_ID = 'user-sol-1';
const SIG = 'solSig1111111111111111111111111111111111111111111111111111111111';

/** Encode SPL Transfer (disc=3) instruction data */
function encodeTransfer(amount: bigint): string {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(3, 0);
  buf.writeBigUInt64LE(amount, 1);
  return bs58.encode(buf);
}

/** Build a minimal block fixture with one SPL Transfer to DST_ATA */
function makeBlock(slot: number, destAta = DST_ATA) {
  const accountKeys = [
    { pubkey: { toBase58: () => TOKEN_PROGRAM_ID } },
    { pubkey: { toBase58: () => SRC_ATA } },
    { pubkey: { toBase58: () => destAta } },
    { pubkey: { toBase58: () => AUTHORITY } },
    { pubkey: { toBase58: () => USDT_MINT } },
  ];

  const instruction = {
    programIdIndex: 0,
    accounts: [1, 2, 3], // src, dst, authority
    data: encodeTransfer(500_000n),
  };

  const tx = {
    transaction: {
      signatures: [SIG],
      message: {
        accountKeys,
        instructions: [instruction],
        recentBlockhash: 'blockhash',
      },
    },
    meta: {
      err: null,
      innerInstructions: [],
      postTokenBalances: [
        {
          accountIndex: 2,
          mint: USDT_MINT,
          uiTokenAmount: { amount: '500000', decimals: 6, uiAmount: 0.5, uiAmountString: '0.5' },
          owner: AUTHORITY,
          programId: TOKEN_PROGRAM_ID,
        },
      ],
      preTokenBalances: [],
      logMessages: [],
    },
  };

  return {
    blockhash: `hash${slot}`,
    previousBlockhash: `hash${slot - 1}`,
    parentSlot: slot - 1,
    transactions: [tx],
    blockTime: 1700000000,
    blockHeight: slot,
    rewards: [],
  };
}

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
        returning: vi.fn().mockResolvedValue([{ id: 'dep-sol-1' }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(1) }),
    }),
  } as unknown as Db;
}

function makeQueue(): Queue {
  return { add: vi.fn().mockResolvedValue({ id: 'job-sol-1' }) } as unknown as Queue;
}

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
    const seedDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue([
          {
            id: 'addr-sol-1',
            userId: USER_ID,
            chain: 'sol',
            address: DST_ATA,
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

  it('skips enqueue when destination is not in registry', async () => {
    const block = makeBlock(200, 'UnknownATA111111111111111111111111111111111');
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
