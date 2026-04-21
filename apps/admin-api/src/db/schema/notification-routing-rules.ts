// notification-routing-rules table — which event_type routes to which channel kind.
// Each row is a (event_type, channel_kind) pair with enabled flag.
// UNIQUE (event_type, channel_kind) enforced at DB level.
import { boolean, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { NotifChannelKind, NotifSeverityFilter } from './notification-channels.js';

export const notificationRoutingRules = pgTable(
  'notification_routing_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    severity: text('severity').notNull().$type<NotifSeverityFilter>(),
    channelKind: text('channel_kind').notNull().$type<NotifChannelKind>(),
    enabled: boolean('enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('uq_routing_event_channel').on(t.eventType, t.channelKind)]
);

export type NotificationRoutingRuleRow = typeof notificationRoutingRules.$inferSelect;
export type NewNotificationRoutingRule = typeof notificationRoutingRules.$inferInsert;
