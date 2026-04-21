// withdrawals table — outbound transfer requests requiring 2/3 treasurer approval
import { bigint, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { chainEnum, tierEnum, tokenEnum, withdrawalStatusEnum } from './enums';
import { staffMembers } from './staff';
import { users } from './users';

/**
 * A withdrawal request created by an operator on behalf of a user.
 * Requires Policy Engine gate + 2/3 treasurer co-sign before execution.
 *
 * Separation-of-duties check: created_by != approver enforced at application layer
 * and as a DB-level check constraint added in migration 0001.
 */
export const withdrawals = pgTable('withdrawals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  chain: chainEnum('chain').notNull(),
  token: tokenEnum('token').notNull(),
  /** Decimal string to avoid floating-point loss */
  amount: numeric('amount', { precision: 36, scale: 18 }).notNull(),
  destinationAddr: text('destination_addr').notNull(),
  status: withdrawalStatusEnum('status').notNull().default('pending'),
  sourceTier: tierEnum('source_tier').notNull(),
  /** FK to multisig_operations once a signing round is initiated */
  multisigOpId: uuid('multisig_op_id'),
  /** Populated when policy engine applies a time-lock */
  timeLockExpiresAt: timestamp('time_lock_expires_at', { withTimezone: true }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => staffMembers.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

  // ── Broadcast tracking (added in migration 0016) ─────────────────────────
  /** On-chain tx hash once broadcast — populated when status → 'broadcast' */
  txHash: text('tx_hash'),
  /** When this tx was first submitted to the network */
  broadcastAt: timestamp('broadcast_at', { withTimezone: true }),

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

export type WithdrawalRow = typeof withdrawals.$inferSelect;
export type NewWithdrawal = typeof withdrawals.$inferInsert;
