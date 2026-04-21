// notification-channels table — admin-scoped system-level delivery targets.
// Distinct from per-staff prefs (notifications.ts) — this is org-wide channel config.
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export type NotifChannelKind = 'email' | 'slack' | 'pagerduty' | 'webhook';
export type NotifSeverityFilter = 'info' | 'warn' | 'err';

export const notificationChannels = pgTable('notification_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Channel type — determines how target is interpreted */
  kind: text('kind').notNull().$type<NotifChannelKind>(),
  /** Human-readable label (email address, channel name, service name, URL label) */
  name: text('name').notNull(),
  /** Delivery target: email address, Slack webhook URL, PagerDuty key, or webhook URL */
  target: text('target').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  /** Minimum severity to route: info = all, warn = warn+err, err = err only */
  severityFilter: text('severity_filter').notNull().default('info').$type<NotifSeverityFilter>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type NotificationChannelRow = typeof notificationChannels.$inferSelect;
export type NewNotificationChannel = typeof notificationChannels.$inferInsert;
