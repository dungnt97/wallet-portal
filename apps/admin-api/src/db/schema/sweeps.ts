// sweeps table — consolidation transfers from user HD addresses to hot multisig safe
import { bigint, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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

  // ── Recovery columns (Slice 11 — migration 0016) ─────────────────────────
  /** On-chain nonce at broadcast time; required for EVM bump/cancel */
  nonce: bigint('nonce', { mode: 'number' }),
  /** How many gas-bump operations have been applied to this tx */
  bumpCount: integer('bump_count').notNull().default(0),
  /** Timestamp of the most recent bump action */
  lastBumpAt: timestamp('last_bump_at', { withTimezone: true }),
  /** Tx hash of the 0-value self-send cancel tx (EVM only) */
  cancelledNonceTxHash: text('cancelled_nonce_tx_hash'),
});

export type SweepRow = typeof sweeps.$inferSelect;
export type NewSweep = typeof sweeps.$inferInsert;
