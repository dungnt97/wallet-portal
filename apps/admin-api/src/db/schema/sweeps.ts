// sweeps table — consolidation transfers from user HD addresses to hot multisig safe
import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { chainEnum, sweepStatusEnum, tokenEnum } from './enums';
import { staffMembers } from './staff';
import { userAddresses } from './users';

/**
 * A sweep moves funds from user HD deposit addresses to the hot operational safe.
 * Triggered by cron (hourly) or threshold breach.
 * Hot → cold sweeps are treated as intra-custody withdrawals (same table, different source/dest).
 */
export const sweeps = pgTable('sweeps', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** FK to the user_addresses row being swept — drives HD derivation index */
  userAddressId: uuid('user_address_id').references(() => userAddresses.id, {
    onDelete: 'restrict',
  }),
  chain: chainEnum('chain').notNull(),
  token: tokenEnum('token').notNull(),
  fromAddr: text('from_addr').notNull(),
  toMultisig: text('to_multisig').notNull(),
  /** Decimal string to avoid floating-point loss */
  amount: numeric('amount', { precision: 36, scale: 18 }).notNull(),
  status: sweepStatusEnum('status').notNull().default('pending'),
  txHash: text('tx_hash'),
  /** Staff who triggered this sweep — null for system/cron-initiated */
  createdBy: uuid('created_by').references(() => staffMembers.id, { onDelete: 'restrict' }),
  broadcastAt: timestamp('broadcast_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SweepRow = typeof sweeps.$inferSelect;
export type NewSweep = typeof sweeps.$inferInsert;
