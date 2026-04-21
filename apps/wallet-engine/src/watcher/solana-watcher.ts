// Solana slot watcher — polls getSlot every POLL_INTERVAL_MS,
// fetches block, parses SPL Transfer/TransferChecked for USDT/USDC,
// matches destination ATA against address registry, delegates to deposit-detector.
import type {
  Connection,
  ParsedTransactionWithMeta,
  VersionedBlockResponse,
} from '@solana/web3.js';
import type { Queue } from 'bullmq';
import pino from 'pino';
import type { Db } from '../db/client.js';
import type { AddressRegistry } from './address-registry.js';
import type { BlockCheckpoint } from './block-checkpoint.js';
import { detectDeposit } from './deposit-detector.js';
import { parseSplTransfers } from './solana-tx-parser.js';

const logger = pino({ name: 'solana-watcher' });

const DEFAULT_POLL_INTERVAL_MS = 2_000;

export interface SolanaWatcherOptions {
  pollIntervalMs?: number;
  usdtMint: string;
  usdcMint: string;
}

export class SolanaWatcher {
  private stopped = false;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private lastProcessedSlot = -1;
  private consecutiveErrors = 0;

  constructor(
    private readonly connection: Connection,
    private readonly db: Db,
    private readonly queue: Queue,
    private readonly registry: AddressRegistry,
    private readonly checkpoint: BlockCheckpoint,
    private readonly opts: SolanaWatcherOptions
  ) {}

  async start(): Promise<void> {
    const saved = await this.checkpoint.load('sol');
    if (saved !== null) {
      this.lastProcessedSlot = saved;
      logger.info({ lastSlot: this.lastProcessedSlot }, 'Solana watcher resumed from checkpoint');
    } else {
      try {
        const tip = await this.connection.getSlot();
        this.lastProcessedSlot = tip;
        await this.checkpoint.save('sol', tip);
        logger.info({ lastSlot: tip }, 'Solana watcher starting from current tip');
      } catch (err) {
        logger.warn(
          { err },
          'Solana watcher could not fetch initial slot — will retry on first tick'
        );
      }
    }

    const pollIntervalMs = this.opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, pollIntervalMs);

    logger.info({ pollIntervalMs, lastSlot: this.lastProcessedSlot }, 'Solana watcher started');
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    logger.info({ lastSlot: this.lastProcessedSlot }, 'Solana watcher stopped');
  }

  getLastProcessedSlot(): number {
    return this.lastProcessedSlot;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;

    let tip: number;
    try {
      tip = await this.connection.getSlot();
      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors++;
      logger.warn(
        { err, consecutiveErrors: this.consecutiveErrors },
        'Solana getSlot failed — staying idle'
      );
      return;
    }

    if (this.lastProcessedSlot < 0) {
      this.lastProcessedSlot = tip;
      await this.checkpoint.save('sol', tip);
      return;
    }

    if (tip <= this.lastProcessedSlot) return;

    // Process one slot per tick (Solana can produce many slots fast; avoid stacking)
    const targetSlot = this.lastProcessedSlot + 1;
    await this.processSlot(targetSlot);
  }

  private async processSlot(slot: number): Promise<void> {
    let block: VersionedBlockResponse | null;
    try {
      // Cast via unknown: TypeScript overload resolution picks the wrong variant
      // when commitment is included alongside maxSupportedTransactionVersion.
      block = (await (this.connection as Connection).getBlock(slot, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      })) as unknown as VersionedBlockResponse | null;
    } catch (err) {
      // Slot may be skipped (no block produced) — not an error
      logger.debug({ err, slot }, 'Solana getBlock failed (slot may be skipped)');
      // Advance anyway so we don't get stuck
      this.lastProcessedSlot = slot;
      await this.checkpoint.save('sol', slot);
      return;
    }

    if (block === null) {
      // Skipped slot — advance
      this.lastProcessedSlot = slot;
      await this.checkpoint.save('sol', slot);
      return;
    }

    for (const tx of block.transactions) {
      // getBlock with maxSupportedTransactionVersion returns VersionedTransactionResponse
      // Cast to ParsedTransactionWithMeta shape — parseSplTransfers only uses
      // tx.transaction.message.instructions + tx.transaction.signatures
      const parsed = tx as unknown as ParsedTransactionWithMeta;
      if (!parsed.transaction?.signatures?.[0]) continue;

      const transfers = parseSplTransfers(parsed, slot, this.opts.usdtMint, this.opts.usdcMint);

      for (const transfer of transfers) {
        const entry = this.registry.lookup('sol', transfer.destination);
        if (!entry) continue;

        await detectDeposit(this.db, this.queue, {
          chain: 'sol',
          txHash: transfer.txHash,
          logIndex: 0,
          blockNumber: slot,
          token: transfer.token,
          amount: transfer.amount,
          to: transfer.destination,
          userId: entry.userId,
        });
      }
    }

    this.lastProcessedSlot = slot;
    await this.checkpoint.save('sol', slot);
    logger.debug({ slot, txCount: block.transactions.length }, 'Solana slot processed');
  }
}
