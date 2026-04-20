// audit_log table — append-only, hash-chained, 7-year retention
// UPDATE/DELETE are blocked by DB trigger (see migration 0001_audit_trigger.sql)
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { staffMembers } from './staff';

/**
 * Immutable audit trail for all staff actions.
 *
 * Security guarantees (enforced at DB layer via migration 0001):
 * - Append-only: REVOKE UPDATE/DELETE grants + RULE blocks mutations
 * - Hash-chain: trigger sets prev_hash = last row's hash, computes new hash via pgcrypto SHA-256
 *   hash = sha256(prev_hash || staff_id || action || changes)
 * - 7-year retention: enforced by application-level archival job (not DB policy in MVP)
 *
 * Partition strategy: partitioned by month after 1yr retention (documented, not enforced in MVP).
 */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Null for system-initiated events (e.g. block watcher crediting a deposit) */
  staffId: uuid('staff_id').references(() => staffMembers.id, { onDelete: 'set null' }),
  /** Verb describing the action, e.g. 'deposit.credit', 'withdrawal.approve' */
  action: text('action').notNull(),
  /** Resource category, e.g. 'deposit', 'withdrawal', 'staff_member' */
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  /** JSONB diff of before/after state — no raw PII; redacted by service layer */
  changes: jsonb('changes'),
  /** Source IP of the request */
  ipAddr: text('ip_addr'),
  /** User-Agent header */
  ua: text('ua'),
  /** SHA-256 hex of previous audit row's hash — '' for first row */
  prevHash: text('prev_hash'),
  /** SHA-256 hex computed by DB trigger at insert time */
  hash: text('hash').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
