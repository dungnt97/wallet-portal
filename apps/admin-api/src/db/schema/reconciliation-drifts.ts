// reconciliation_drifts table — per-address drift rows linked to a snapshot
// Each row represents one (address, token) pair where drift exceeded dust threshold.
import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { reconciliationSnapshots } from './reconciliation-snapshots.js';

/**
 * A single per-address drift record within a reconciliation snapshot.
 * Only created when abs(drift_minor) > RECON_DUST_THRESHOLD_CENTS.
 *
 * Severity classification:
 *   'info'     — |drift_usd| in ($1, $10]
 *   'warning'  — |drift_usd| in ($10, $100]
 *   'critical' — |drift_usd| > $100
 *
 * suppressed_reason is set when the drift row exists but should not trigger an alert:
 *   'in_flight_withdrawal' — address has a pending/approved/time_locked/broadcast withdrawal
 */
export const reconciliationDrifts = pgTable(
  'reconciliation_drifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => reconciliationSnapshots.id, { onDelete: 'cascade' }),
    chain: text('chain').notNull(),
    token: text('token').notNull(),
    address: text('address').notNull(),
    /** Human-readable account label e.g. 'hot_safe', 'cold_reserve', 'user:<uuid>' */
    accountLabel: text('account_label').notNull(),
    /** On-chain balance at snapshot time (in token's minor units) */
    onChainMinor: bigint('on_chain_minor', { mode: 'bigint' }).notNull(),
    /** Ledger-expected balance (sum of credits - debits in minor units) */
    ledgerMinor: bigint('ledger_minor', { mode: 'bigint' }).notNull(),
    /** Net drift = onChain - ledger (signed; negative = ledger exceeds on-chain) */
    driftMinor: bigint('drift_minor', { mode: 'bigint' }).notNull(),
    severity: text('severity').notNull().$type<DriftSeverity>(),
    /** Non-null when drift is acknowledged as expected (e.g. in-flight operation) */
    suppressedReason: text('suppressed_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_recon_drifts_snapshot').on(t.snapshotId),
    index('idx_recon_drifts_chain_token_addr').on(t.chain, t.token, t.address),
  ]
);

export type DriftSeverity = 'info' | 'warning' | 'critical';

export type ReconciliationDriftRow = typeof reconciliationDrifts.$inferSelect;
export type NewReconciliationDrift = typeof reconciliationDrifts.$inferInsert;
