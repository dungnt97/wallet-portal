import type { Queue } from 'bullmq';
// BNB block watcher — polls getBlockNumber every POLL_INTERVAL_MS,
// fetches ERC-20 Transfer logs for USDT/USDC, matches against address registry,
// delegates to deposit-detector for persist + enqueue.
import type { FallbackProvider, Log } from 'ethers';
import pino from 'pino';
import type { Db } from '../db/client.js';
import type { AddressRegistry } from './address-registry.js';
import type { BlockCheckpoint } from './block-checkpoint.js';
import { TRANSFER_TOPIC, parseErc20TransferLog } from './bnb-log-parser.js';
import { detectDeposit } from './deposit-detector.js';

const logger = pino({ name: 'bnb-watcher' });

const DEFAULT_POLL_INTERVAL_MS = 5_000;
/** Max blocks to catch up per tick — BSC testnet public RPCs limit getLogs range */
const MAX_BLOCKS_PER_TICK = 10;
/** Exponential backoff: max delay between retries on RPC error (ms) */
const MAX_BACKOFF_MS = 30_000;
/**
 * Public BSC testnet RPCs prune log history beyond ~512 blocks. If the saved
 * checkpoint falls further behind chain tip than this (e.g. wallet-engine was
 * offline overnight), the watcher would loop forever on `getLogs` errors. At
 * startup we detect that condition and skip-ahead to (tip - SAFETY_BUFFER).
 * Historical deposits in the gap are unrecoverable from a pruned RPC anyway —
 * for prod, point at a full archive node and this guard is a no-op.
 */
const MAX_STARTUP_CATCHUP_BLOCKS = 256;
const STARTUP_SAFETY_BUFFER = 64;

export interface BnbWatcherOptions {
  pollIntervalMs?: number;
  usdtAddress: string;
  usdcAddress: string;
}

export class BnbWatcher {
  private stopped = false;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private lastProcessedBlock = -1;
  private consecutiveErrors = 0;

  constructor(
    private readonly provider: FallbackProvider,
    private readonly db: Db,
    private readonly queue: Queue,
    private readonly registry: AddressRegistry,
    private readonly checkpoint: BlockCheckpoint,
    private readonly opts: BnbWatcherOptions
  ) {}

  async start(): Promise<void> {
    // Load persisted checkpoint on start
    const saved = await this.checkpoint.load('bnb');
    if (saved !== null) {
      this.lastProcessedBlock = saved;
      logger.info({ lastBlock: this.lastProcessedBlock }, 'BNB watcher resumed from checkpoint');
      // Skip-ahead guard: if we're so far behind that public RPCs will reject
      // getLogs (history pruned), jump near tip so the watcher can move forward.
      try {
        const tip = await this.provider.getBlockNumber();
        const lag = tip - saved;
        if (lag > MAX_STARTUP_CATCHUP_BLOCKS) {
          const skipTo = Math.max(0, tip - STARTUP_SAFETY_BUFFER);
          logger.warn(
            { savedCheckpoint: saved, tip, lag, skipTo },
            'BNB checkpoint too stale for catch-up — skipping ahead near tip'
          );
          this.lastProcessedBlock = skipTo;
          await this.checkpoint.save('bnb', skipTo);
        }
      } catch (err) {
        logger.warn(
          { err },
          'BNB watcher could not probe tip on startup — proceeding from saved checkpoint'
        );
      }
    } else {
      // First run — start from current tip (no historical backfill)
      try {
        const tip = await this.provider.getBlockNumber();
        this.lastProcessedBlock = tip;
        await this.checkpoint.save('bnb', tip);
        logger.info({ lastBlock: tip }, 'BNB watcher starting from current tip');
      } catch (err) {
        logger.warn(
          { err },
          'BNB watcher could not fetch initial block — will retry on first tick'
        );
      }
    }

    const pollIntervalMs = this.opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, pollIntervalMs);

    logger.info({ pollIntervalMs, lastBlock: this.lastProcessedBlock }, 'BNB watcher started');
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    logger.info({ lastBlock: this.lastProcessedBlock }, 'BNB watcher stopped');
  }

  getLastProcessedBlock(): number {
    return this.lastProcessedBlock;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;

    let tip: number;
    try {
      tip = await this.provider.getBlockNumber();
      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors++;
      const backoff = Math.min(200 * 2 ** (this.consecutiveErrors - 1), MAX_BACKOFF_MS);
      logger.warn(
        { err, consecutiveErrors: this.consecutiveErrors, backoff },
        'BNB getBlockNumber failed — backing off'
      );
      return;
    }

    if (this.lastProcessedBlock < 0) {
      // Still uninitialised (initial getBlockNumber failed at start)
      this.lastProcessedBlock = tip;
      await this.checkpoint.save('bnb', tip);
      return;
    }

    if (tip <= this.lastProcessedBlock) return;

    // Clamp catch-up range to MAX_BLOCKS_PER_TICK
    const fromBlock = this.lastProcessedBlock + 1;
    const toBlock = Math.min(tip, fromBlock + MAX_BLOCKS_PER_TICK - 1);

    await this.processRange(fromBlock, toBlock);
  }

  private async processRange(fromBlock: number, toBlock: number): Promise<void> {
    let logs: Log[];
    try {
      logs = await this.provider.getLogs({
        fromBlock,
        toBlock,
        topics: [TRANSFER_TOPIC],
        address: [this.opts.usdtAddress, this.opts.usdcAddress],
      });
    } catch (err) {
      logger.error({ err, fromBlock, toBlock }, 'BNB getLogs failed');
      return;
    }

    for (const log of logs) {
      const transfer = parseErc20TransferLog(log, this.opts.usdtAddress, this.opts.usdcAddress);
      if (!transfer) continue;

      const entry = this.registry.lookup('bnb', transfer.to);
      if (!entry) continue;

      await detectDeposit(this.db, this.queue, {
        chain: 'bnb',
        txHash: transfer.txHash,
        logIndex: transfer.logIndex,
        blockNumber: transfer.blockNumber,
        token: transfer.token,
        amount: transfer.amount,
        to: transfer.to,
        userId: entry.userId,
      });
    }

    this.lastProcessedBlock = toBlock;
    await this.checkpoint.save('bnb', toBlock);
    logger.debug({ fromBlock, toBlock, logs: logs.length }, 'BNB block range processed');
  }
}
