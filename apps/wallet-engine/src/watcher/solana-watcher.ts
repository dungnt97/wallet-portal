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
const MAX_BACKOFF_MS = 60_000;
/**
 * Solana devnet produces ~2.5 slots/sec; the watcher processes 5 slots per 2s
 * tick — break-even with zero margin. If the watcher falls behind (e.g. wallet-
 * engine offline overnight) it can never catch up, and slots more than ~1000
 * behind are likely already pruned from the public RPC. At startup, skip-ahead
 * to (tip - SAFETY_BUFFER) when lag exceeds the threshold.
 */
const MAX_STARTUP_CATCHUP_SLOTS = 500;
const STARTUP_SAFETY_BUFFER_SLOTS = 64;

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
  private skipUntil = 0;

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
      // Skip-ahead guard: throughput barely matches chain rate, so a stale
      // checkpoint will never catch up; old slots are pruned by public RPC anyway.
      try {
        const tip = await this.connection.getSlot();
        const lag = tip - saved;
        if (lag > MAX_STARTUP_CATCHUP_SLOTS) {
          const skipTo = Math.max(0, tip - STARTUP_SAFETY_BUFFER_SLOTS);
          logger.warn(
            { savedCheckpoint: saved, tip, lag, skipTo },
            'Solana checkpoint too stale for catch-up — skipping ahead near tip'
          );
          this.lastProcessedSlot = skipTo;
          await this.checkpoint.save('sol', skipTo);
        }
      } catch (err) {
        logger.warn(
          { err },
          'Solana watcher could not probe tip on startup — proceeding from saved checkpoint'
        );
      }
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
    if (Date.now() < this.skipUntil) return;

    let tip: number;
    try {
      tip = await this.connection.getSlot();
      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors++;
      const backoff = Math.min(1_000 * 2 ** (this.consecutiveErrors - 1), MAX_BACKOFF_MS);
      this.skipUntil = Date.now() + backoff;
      logger.warn(
        { err, consecutiveErrors: this.consecutiveErrors, backoffMs: backoff },
        'Solana getSlot failed — backing off'
      );
      return;
    }

    if (this.lastProcessedSlot < 0) {
      this.lastProcessedSlot = tip;
      await this.checkpoint.save('sol', tip);
      return;
    }

    if (tip <= this.lastProcessedSlot) return;

    const maxSlotsPerTick = 5;
    const endSlot = Math.min(tip, this.lastProcessedSlot + maxSlotsPerTick);
    for (let slot = this.lastProcessedSlot + 1; slot <= endSlot; slot++) {
      await this.processSlot(slot);
    }
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
      const msg = String(err);
      if (msg.includes('429')) {
        this.consecutiveErrors++;
        const backoff = Math.min(1_000 * 2 ** (this.consecutiveErrors - 1), MAX_BACKOFF_MS);
        this.skipUntil = Date.now() + backoff;
        logger.warn({ slot, backoffMs: backoff }, 'Solana getBlock rate-limited — backing off');
        return;
      }
      // Slot may be skipped (no block produced) — not an error
      logger.debug({ err, slot }, 'Solana getBlock failed (slot may be skipped)');
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

      let transfers: ReturnType<typeof parseSplTransfers>;
      try {
        transfers = parseSplTransfers(parsed, slot, this.opts.usdtMint, this.opts.usdcMint);
      } catch (err) {
        logger.warn(
          { err, slot, sig: parsed.transaction.signatures[0] },
          'parseSplTransfers failed — skipping tx'
        );
        continue;
      }

      for (const transfer of transfers) {
        // SPL transfer destination is the ATA; use postTokenBalances owner (wallet) for lookup
        const lookupAddr = transfer.owner ?? transfer.destination;
        const entry = this.registry.lookup('sol', lookupAddr);
        if (!entry) continue;

        await detectDeposit(this.db, this.queue, {
          chain: 'sol',
          txHash: transfer.txHash,
          logIndex: 0,
          blockNumber: slot,
          token: transfer.token,
          amount: transfer.amount,
          to: lookupAddr,
          userId: entry.userId,
        });
      }
    }

    this.lastProcessedSlot = slot;
    await this.checkpoint.save('sol', slot);
    logger.debug({ slot, txCount: block.transactions.length }, 'Solana slot processed');
  }
}
