// transactions table — on-chain transaction records shared across deposits, withdrawals, sweeps
import { bigint, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { chainEnum, tokenEnum, txStatusEnum } from './enums';

/**
 * Canonical on-chain transaction record.
 * Referenced by deposits, withdrawals and sweeps via tx_hash or FK.
 * block_number stored as bigint string to safely handle chain-specific large integers.
 */
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  hash: text('hash').notNull().unique(),
  chain: chainEnum('chain').notNull(),
  fromAddr: text('from_addr').notNull(),
  toAddr: text('to_addr').notNull(),
  /** Decimal string to avoid floating-point loss */
  amount: numeric('amount', { precision: 36, scale: 18 }).notNull(),
  token: tokenEnum('token').notNull(),
  status: txStatusEnum('status').notNull().default('pending'),
  /** Nullable until mined */
  blockNumber: bigint('block_number', { mode: 'bigint' }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
