// notif-system-channel-fanout.service — fan-out to org-level notification channels
// based on notification_routing_rules + notification_channels tables.
//
// Called from notifyStaff AFTER per-staff prefs flow — additive, not replacement.
// NOTIFICATIONS_ENABLED=false → no-op (consistent with main notifyStaff gate).
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import type { NotifSeverityFilter } from '../db/schema/notification-channels.js';
import type { NotificationSeverity } from '../db/schema/notifications.js';

// Map per-staff severity ('critical') to routing severity ('err')
function toRoutingSeverity(severity: NotificationSeverity): NotifSeverityFilter {
  if (severity === 'critical') return 'err';
  if (severity === 'warning') return 'warn';
  return 'info';
}

// Severity ordering for filter check: info >= warn >= err
const SEVERITY_RANK: Record<NotifSeverityFilter, number> = { info: 0, warn: 1, err: 2 };

function meetsSeverityFilter(
  eventSeverity: NotifSeverityFilter,
  channelFilter: NotifSeverityFilter
): boolean {
  return SEVERITY_RANK[eventSeverity] >= SEVERITY_RANK[channelFilter];
}

// ── Channel-specific dispatchers ──────────────────────────────────────────────

async function dispatchEmail(
  channel: schema.NotificationChannelRow,
  eventType: string,
  title: string,
  body: string | null
): Promise<void> {
  // Dry-run guard consistent with notif-email-transport.service
  if (process.env.NOTIFICATIONS_DRY_RUN !== 'false') {
    console.info('[system-channel] DRY_RUN email to=%s subject=%s', channel.target, title);
    return;
  }
  // Full SMTP delivery requires cfg (host/port/auth) which is not available here without
  // passing it as a parameter. For now log a structured intent — a follow-up slice can
  // wire the SmtpConfig if env vars are accessible.
  console.info(
    '[system-channel] EMAIL eventType=%s title=%s to=%s',
    eventType,
    title,
    channel.target
  );
}

async function dispatchSlack(
  channel: schema.NotificationChannelRow,
  eventType: string,
  title: string,
  body: string | null
): Promise<void> {
  if (process.env.NOTIFICATIONS_DRY_RUN !== 'false') {
    console.info('[system-channel] DRY_RUN slack url=<masked> title=%s', title);
    return;
  }
  try {
    const res = await fetch(channel.target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `*[${eventType}]* ${title}${body ? `\n${body}` : ''}`,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.warn('[system-channel] Slack non-2xx status=%d channelId=%s', res.status, channel.id);
    }
  } catch (err) {
    console.warn('[system-channel] Slack dispatch error channelId=%s err=%s', channel.id, err);
  }
}

async function dispatchWebhook(
  channel: schema.NotificationChannelRow,
  eventType: string,
  title: string,
  body: string | null,
  payload: Record<string, unknown> | null
): Promise<void> {
  if (process.env.NOTIFICATIONS_DRY_RUN !== 'false') {
    console.info('[system-channel] DRY_RUN webhook url=<masked> title=%s', title);
    return;
  }
  try {
    const res = await fetch(channel.target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventType,
        title,
        body,
        payload,
        firedAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.warn(
        '[system-channel] Webhook non-2xx status=%d channelId=%s',
        res.status,
        channel.id
      );
    }
  } catch (err) {
    console.warn('[system-channel] Webhook dispatch error channelId=%s err=%s', channel.id, err);
  }
}

async function dispatchPagerDuty(
  channel: schema.NotificationChannelRow,
  eventType: string,
  title: string,
  body: string | null
): Promise<void> {
  if (process.env.NOTIFICATIONS_DRY_RUN !== 'false') {
    console.info('[system-channel] DRY_RUN pagerduty key=<masked> title=%s', title);
    return;
  }
  try {
    const res = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        routing_key: channel.target,
        event_action: 'trigger',
        payload: {
          summary: `[${eventType}] ${title}`,
          severity: 'error',
          source: 'wallet-portal',
          custom_details: { body },
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn(
        '[system-channel] PagerDuty non-2xx status=%d channelId=%s',
        res.status,
        channel.id
      );
    }
  } catch (err) {
    console.warn('[system-channel] PagerDuty dispatch error channelId=%s err=%s', channel.id, err);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface SystemChannelFanoutInput {
  eventType: string;
  severity: NotificationSeverity;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown> | null;
}

/**
 * Fan-out a notification event to all enabled system channels that have a
 * matching enabled routing rule AND whose severity_filter is met.
 *
 * Non-fatal: individual channel failures are logged and swallowed so they
 * do not block per-staff prefs delivery or throw to the caller.
 */
export async function fanoutToSystemChannels(
  db: Db,
  input: SystemChannelFanoutInput
): Promise<void> {
  if (process.env.NOTIFICATIONS_ENABLED === 'false') return;

  const { eventType, severity, title, body, payload } = input;
  const routingSeverity = toRoutingSeverity(severity);

  // Load enabled routing rules for this event type
  const rules = await db
    .select()
    .from(schema.notificationRoutingRules)
    .where(
      and(
        eq(schema.notificationRoutingRules.eventType, eventType),
        eq(schema.notificationRoutingRules.enabled, true)
      )
    );

  if (rules.length === 0) return;

  // Load all enabled channels indexed by kind
  const channels = await db
    .select()
    .from(schema.notificationChannels)
    .where(eq(schema.notificationChannels.enabled, true));

  const channelsByKind = new Map<schema.NotifChannelKind, schema.NotificationChannelRow[]>();
  for (const ch of channels) {
    const list = channelsByKind.get(ch.kind) ?? [];
    list.push(ch);
    channelsByKind.set(ch.kind, list);
  }

  // Dispatch to matching channels concurrently
  const dispatches: Promise<void>[] = [];

  for (const rule of rules) {
    const targets = channelsByKind.get(rule.channelKind) ?? [];
    for (const channel of targets) {
      if (!meetsSeverityFilter(routingSeverity, channel.severityFilter)) continue;

      let dispatch: Promise<void>;
      switch (channel.kind) {
        case 'email':
          dispatch = dispatchEmail(channel, eventType, title, body ?? null);
          break;
        case 'slack':
          dispatch = dispatchSlack(channel, eventType, title, body ?? null);
          break;
        case 'pagerduty':
          dispatch = dispatchPagerDuty(channel, eventType, title, body ?? null);
          break;
        case 'webhook':
          dispatch = dispatchWebhook(channel, eventType, title, body ?? null, payload ?? null);
          break;
      }
      dispatches.push(
        dispatch.catch((err: unknown) =>
          console.warn('[system-channel] dispatch failed channelId=%s err=%s', channel.id, err)
        )
      );
    }
  }

  await Promise.all(dispatches);
}
