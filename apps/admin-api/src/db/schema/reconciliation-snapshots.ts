// reconciliation_snapshots table — one row per reconciliation run
// Tracks status, scope, and aggregate totals for each snapshot.
import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { staffMembers } from './staff.js';

/**
 * A reconciliation run captures on-chain vs ledger totals for managed wallets.
 * triggered_by = NULL means the run was initiated by the daily cron job.
 *
 * Scope values:
 *   'all'   — all managed addresses (hot + cold + users)
 *   'hot'   — hot safe wallets only
 *   'cold'  — cold reserve wallets only
 *   'users' — user HD deposit addresses only
 */
export const reconciliationSnapshots = pgTable('reconciliation_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  /** NULL = triggered by cron; non-null = admin who triggered manually */
  triggeredBy: uuid('triggered_by').references(() => staffMembers.id, { onDelete: 'set null' }),
  /** Run lifecycle: running → completed | failed | cancelled */
  status: text('status').notNull().default('running').$type<SnapshotStatus>(),
  /** Filter: null = all chains; 'bnb' | 'sol' for single-chain run */
  chain: text('chain'),
  /** Which wallet tier/scope was probed */
  scope: text('scope').notNull().default('all').$type<SnapshotScope>(),
  /** Sum of all on-chain balances in minor units (stablecoin-specific decimals) */
  onChainTotalMinor: bigint('on_chain_total_minor', { mode: 'bigint' }),
  /** Sum of all ledger-expected balances in minor units */
  ledgerTotalMinor: bigint('ledger_total_minor', { mode: 'bigint' }),
  /** Net drift = onChain - ledger in minor units */
  driftTotalMinor: bigint('drift_total_minor', { mode: 'bigint' }),
  /** Populated when status = 'failed' */
  errorMessage: text('error_message'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export type SnapshotStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type SnapshotScope = 'all' | 'hot' | 'cold' | 'users';

export type ReconciliationSnapshotRow = typeof reconciliationSnapshots.$inferSelect;
export type NewReconciliationSnapshot = typeof reconciliationSnapshots.$inferInsert;
