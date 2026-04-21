// watcher_checkpoints — persists last processed block/slot per chain
// Used by wallet-engine BNB + Solana watchers to resume after restart.
import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { chainEnum } from './enums';

export const watcherCheckpoints = pgTable('watcher_checkpoints', {
  /** Primary key: one row per chain */
  chain: chainEnum('chain').primaryKey(),
  /** Last successfully processed block number (BNB) or slot (Solana) */
  lastBlock: bigint('last_block', { mode: 'number' }).notNull(),
  /** Block hash at lastBlock — used for reorg detection */
  lastHash: text('last_hash'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type WatcherCheckpointRow = typeof watcherCheckpoints.$inferSelect;
export type NewWatcherCheckpoint = typeof watcherCheckpoints.$inferInsert;
