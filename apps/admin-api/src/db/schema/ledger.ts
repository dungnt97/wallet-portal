// ledger_entries table — double-entry bookkeeping for all fund movements
import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tokenEnum } from './enums';
import { transactions } from './transactions';

/**
 * Double-entry ledger: every fund movement produces a balanced debit + credit pair.
 *
 * Invariant (enforced by check constraint in migration 0001):
 *   debit >= 0 AND credit >= 0 AND exactly one of debit/credit is non-zero per row.
 *   Balanced pair: sum(debit) == sum(credit) for any given tx_id.
 *
 * Account identifiers (examples):
 *   'user:<uuid>'    — user custody balance
 *   'hot_safe'       — hot multisig operational pool
 *   'cold_reserve'   — cold multisig reserve pool
 *   'fee'            — network fee sink
 *   'external'       — external counterparty (withdrawals/deposits)
 */
export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  txId: uuid('tx_id')
    .notNull()
    .references(() => transactions.id, { onDelete: 'restrict' }),
  /** Logical account identifier — scoped to currency */
  account: text('account').notNull(),
  /** Non-negative decimal; zero if this is the credit leg */
  debit: numeric('debit', { precision: 36, scale: 18 }).notNull().default('0'),
  /** Non-negative decimal; zero if this is the debit leg */
  credit: numeric('credit', { precision: 36, scale: 18 }).notNull().default('0'),
  currency: tokenEnum('currency').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
