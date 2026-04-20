// sweeps table — consolidation transfers from user HD addresses to hot multisig safe
import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { chainEnum, sweepStatusEnum, tokenEnum } from './enums';

/**
 * A sweep moves funds from user HD deposit addresses to the hot operational safe.
 * Triggered by cron (hourly) or threshold breach.
 * Hot → cold sweeps are treated as intra-custody withdrawals (same table, different source/dest).
 */
export const sweeps = pgTable('sweeps', {
  id: uuid('id').primaryKey().defaultRandom(),
  chain: chainEnum('chain').notNull(),
  token: tokenEnum('token').notNull(),
  fromAddr: text('from_addr').notNull(),
  toMultisig: text('to_multisig').notNull(),
  /** Decimal string to avoid floating-point loss */
  amount: numeric('amount', { precision: 36, scale: 18 }).notNull(),
  status: sweepStatusEnum('status').notNull().default('pending'),
  txHash: text('tx_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SweepRow = typeof sweeps.$inferSelect;
export type NewSweep = typeof sweeps.$inferInsert;
