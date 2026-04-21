// notifications table — persisted staff-targeted event rows for the bell panel,
// email digest, and Slack webhook workers.
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { staffMembers } from './staff.js';

// ── Notification prefs shape (stored as JSONB on staff_members) ───────────────

export interface NotificationEventPrefs {
  withdrawal: boolean;
  sweep: boolean;
  deposit: boolean;
  killSwitch: boolean;
  reorg: boolean;
  health: boolean;
  coldTimelock: boolean;
}

export interface NotificationPrefs {
  inApp: boolean;
  email: boolean;
  slack: boolean;
  eventTypes: NotificationEventPrefs;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  inApp: true,
  email: true,
  slack: false,
  eventTypes: {
    withdrawal: true,
    sweep: true,
    deposit: true,
    killSwitch: true,
    reorg: true,
    health: true,
    coldTimelock: true,
  },
};

// ── Severity literals ─────────────────────────────────────────────────────────

export type NotificationSeverity = 'info' | 'warning' | 'critical';

// ── notifications table ───────────────────────────────────────────────────────

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffMembers.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    severity: text('severity').notNull().$type<NotificationSeverity>(),
    title: text('title').notNull(),
    body: text('body'),
    /** Arbitrary structured data — stringified before storage, parsed on read */
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    /** Deduplication key — when set, UNIQUE (staff_id, event_type, dedupe_key) prevents repeats */
    dedupeKey: text('dedupe_key'),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Set by digest worker when this row is included in a digest email */
    digestSentAt: timestamp('digest_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Fast unread count + panel list query per staff
    index('idx_notifications_staff_unread').on(t.staffId, t.readAt, t.createdAt),
    // Partial dedupe — enforced at DB level; the unique constraint in SQL uses a WHERE clause
    // which Drizzle doesn't support natively, so we declare a normal unique here for the ORM
    // and rely on the partial unique index created in the migration for actual DB enforcement.
    unique('idx_notifications_dedupe').on(t.staffId, t.eventType, t.dedupeKey),
  ]
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
