// recovery_actions table — audit trail for every bump/cancel operation on a stuck tx.
// Each row is immutable once created; status transitions are bump-only (pending → broadcast → confirmed/failed).
import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { staffMembers } from './staff';

/**
 * Records every gas-bump or cancel-replace action taken on a stuck withdrawal or sweep.
 * Idempotency key prevents double-actions from concurrent requests or retries.
 */
export const recoveryActions = pgTable('recovery_actions', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** Client-supplied dedup token — UNIQUE ensures exactly-once semantics within 24h TTL */
  idempotencyKey: text('idempotency_key').notNull().unique(),

  /** 'bump' = fee increase at same nonce; 'cancel' = 0-value self-send at same nonce */
  actionType: text('action_type').notNull(),

  /** 'withdrawal' or 'sweep' */
  entityType: text('entity_type').notNull(),

  /** PK of the target withdrawal or sweep row */
  entityId: uuid('entity_id').notNull(),

  /** Chain identifier (e.g. 'bnb', 'sol') */
  chain: text('chain').notNull(),

  /** Tx hash that was stuck before the action */
  originalTxHash: text('original_tx_hash').notNull(),

  /** Replacement tx hash returned after broadcast (NULL until broadcast succeeds) */
  newTxHash: text('new_tx_hash'),

  /** Effective gas price used for the replacement tx in gwei */
  gasPriceGwei: numeric('gas_price_gwei', { precision: 20, scale: 9 }),

  /** 'pending' → 'broadcast' → 'confirmed' | 'failed' */
  status: text('status').notNull().default('pending'),

  /** Staff member who triggered this action */
  initiatedBy: uuid('initiated_by')
    .notNull()
    .references(() => staffMembers.id, { onDelete: 'restrict' }),

  /** Populated when status transitions to 'failed' */
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export type RecoveryActionRow = typeof recoveryActions.$inferSelect;
export type NewRecoveryAction = typeof recoveryActions.$inferInsert;
