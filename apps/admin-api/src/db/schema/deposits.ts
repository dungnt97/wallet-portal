// deposits table — inbound transfers detected by wallet-engine block watcher
// manual=true marks admin-override credits (migration 0020)
import { boolean, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { chainEnum, depositStatusEnum, tokenEnum } from './enums';
import { staffMembers } from './staff';
import { users } from './users';

/**
 * A deposit detected on-chain for a user's HD address.
 * State machine: pending → credited → swept | failed
 */
export const deposits = pgTable('deposits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  chain: chainEnum('chain').notNull(),
  token: tokenEnum('token').notNull(),
  /** Decimal string to avoid floating-point loss (e.g. "1000.50") */
  amount: numeric('amount', { precision: 36, scale: 18 }).notNull(),
  status: depositStatusEnum('status').notNull().default('pending'),
  /** Number of confirmed blocks at last check */
  confirmedBlocks: integer('confirmed_blocks').notNull().default(0),
  /** On-chain transaction hash — null until detected */
  txHash: text('tx_hash'),
  /** true for admin-override manual credits (migration 0020) */
  manual: boolean('manual').notNull().default(false),
  /** Admin's justification for manual credit — required when manual=true */
  reason: text('reason'),
  /** Staff member who applied the manual credit — null for on-chain deposits */
  creditedBy: uuid('credited_by').references(() => staffMembers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type DepositRow = typeof deposits.$inferSelect;
export type NewDeposit = typeof deposits.$inferInsert;
