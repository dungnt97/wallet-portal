import { watcherCheckpoints } from '@wp/admin-api/db-schema';
// Block checkpoint — persists last processed block/slot per chain in DB.
// On startup watchers load from here to resume; on each tick they save after success.
// Also handles reorg detection: stores block hash and compares on next tick.
import { eq } from 'drizzle-orm';
import pino from 'pino';
import type { Db } from '../db/client.js';

const logger = pino({ name: 'block-checkpoint' });

/** Number of blocks to roll back when a reorg is detected */
const REORG_ROLLBACK_BLOCKS = 3;

export class BlockCheckpoint {
  constructor(private readonly db: Db) {}

  /** Load persisted last_block for chain; returns null on first run */
  async load(chain: 'bnb' | 'sol'): Promise<number | null> {
    try {
      const [row] = await this.db
        .select({ lastBlock: watcherCheckpoints.lastBlock })
        .from(watcherCheckpoints)
        .where(eq(watcherCheckpoints.chain, chain))
        .limit(1);
      return row?.lastBlock ?? null;
    } catch (err) {
      logger.error({ err, chain }, 'Failed to load checkpoint');
      return null;
    }
  }

  /** Persist last processed block (and optional hash for reorg detection) */
  async save(chain: 'bnb' | 'sol', lastBlock: number, lastHash?: string): Promise<void> {
    try {
      await this.db
        .insert(watcherCheckpoints)
        .values({ chain, lastBlock, lastHash: lastHash ?? null, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: watcherCheckpoints.chain,
          set: {
            lastBlock,
            lastHash: lastHash ?? null,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      logger.error({ err, chain, lastBlock }, 'Failed to save checkpoint');
    }
  }

  /** Load the stored hash for a given chain (null if not set) */
  async loadHash(chain: 'bnb' | 'sol'): Promise<string | null> {
    try {
      const [row] = await this.db
        .select({ lastHash: watcherCheckpoints.lastHash })
        .from(watcherCheckpoints)
        .where(eq(watcherCheckpoints.chain, chain))
        .limit(1);
      return row?.lastHash ?? null;
    } catch (err) {
      logger.error({ err, chain }, 'Failed to load checkpoint hash');
      return null;
    }
  }

  /**
   * Compare storedHash against currentHash at the same height.
   * Returns the rollback target block number if reorg detected, null otherwise.
   */
  detectReorg(storedHash: string | null, currentHash: string, currentBlock: number): number | null {
    if (storedHash === null) return null;
    if (storedHash === currentHash) return null;

    const rollbackTo = Math.max(0, currentBlock - REORG_ROLLBACK_BLOCKS);
    logger.warn(
      { currentBlock, storedHash, currentHash, rollbackTo },
      'Reorg detected — rolling back checkpoint'
    );
    return rollbackTo;
  }

  /**
   * Mark deposits affected by reorg as reorg_pending.
   * Caller passes the tx hashes that were in the rolled-back range.
   */
  async markReorgPending(txHashes: string[]): Promise<void> {
    if (txHashes.length === 0) return;
    try {
      const { deposits } = await import('@wp/admin-api/db-schema');
      const { inArray, eq: deq } = await import('drizzle-orm');
      await this.db
        .update(deposits)
        .set({ status: 'reorg_pending' })
        .where(inArray(deposits.txHash, txHashes));
      logger.warn({ count: txHashes.length }, 'Deposits marked reorg_pending');
    } catch (err) {
      logger.error({ err, count: txHashes.length }, 'Failed to mark deposits reorg_pending');
    }
  }
}
