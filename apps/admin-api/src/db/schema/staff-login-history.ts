// staff_login_history table — one row per login attempt (success or failure)
// Used by security page and audit trail. Never DELETE rows (append-only).
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { staffMembers } from './staff';

export const staffLoginHistory = pgTable(
  'staff_login_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL when staff is not found (failed lookup — no FK to protect PII). */
    staffId: uuid('staff_id').references(() => staffMembers.id, { onDelete: 'cascade' }),
    success: boolean('success').notNull(),
    /** Client IP — from x-forwarded-for / remoteAddress */
    ipAddress: text('ip_address'),
    /** Raw User-Agent string for device parsing in UI */
    userAgent: text('user_agent'),
    /** Populated on failed attempts: e.g. 'DOMAIN_NOT_ALLOWED', 'TOKEN_INVALID' */
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byStaffCreated: index('ix_login_history_staff_created').on(t.staffId, t.createdAt),
  })
);

export type StaffLoginHistoryRow = typeof staffLoginHistory.$inferSelect;
export type NewStaffLoginHistory = typeof staffLoginHistory.$inferInsert;
