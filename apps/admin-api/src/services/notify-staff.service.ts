// notify-staff.service — core fan-out: INSERT notifications → Socket.io emit
// → enqueue email/slack jobs per staff prefs + severity.
//
// Usage:
//   await notifyStaff(db, io, { role:'treasurer', eventType:'withdrawal.created',
//     severity:'info', title:'...', body:'...', payload:{...} }, emailQueue, slackQueue)
import type { Queue } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import type { NotificationSeverity } from '../db/schema/notifications.js';
import { emitNotifCreated } from '../events/emit-notif-created.js';
import { getStaffIdsByRole, getStaffPrefs } from './notification-prefs.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const EMAIL_IMMEDIATE_QUEUE = 'notif_email_immediate';
export const SLACK_WEBHOOK_QUEUE = 'notif_slack';

/** Feature kill-switch: NOTIFICATIONS_ENABLED=false → notifyStaff is a no-op */
function isEnabled(): boolean {
  return process.env.NOTIFICATIONS_ENABLED !== 'false';
}

// ── Event type → pref category map ───────────────────────────────────────────

type PrefCategory = keyof schema.NotificationEventPrefs;

const EVENT_CATEGORY_MAP: Record<string, PrefCategory> = {
  'withdrawal.created': 'withdrawal',
  'withdrawal.approved': 'withdrawal',
  'withdrawal.broadcast': 'withdrawal',
  'withdrawal.confirmed': 'withdrawal',
  'sweep.started': 'sweep',
  'sweep.broadcast': 'sweep',
  'sweep.confirmed': 'sweep',
  'deposit.confirmed': 'deposit',
  'deposit.credited': 'deposit',
  'ops.killswitch.enabled': 'killSwitch',
  'ops.killswitch.disabled': 'killSwitch',
  'watcher.reorg': 'reorg',
  'health.degraded': 'health',
  'cold.timelock.expiring': 'coldTimelock',
  'cold.withdrawal.auto-executed': 'coldTimelock',
};

function getPrefCategory(eventType: string): PrefCategory | null {
  // Prefix match for extensibility (e.g. 'withdrawal.*')
  if (eventType in EVENT_CATEGORY_MAP) return EVENT_CATEGORY_MAP[eventType] ?? null;
  const prefix = eventType.split('.')[0];
  for (const [key, cat] of Object.entries(EVENT_CATEGORY_MAP)) {
    if (key.startsWith(`${prefix}.`)) return cat;
  }
  return null;
}

// ── Input type ────────────────────────────────────────────────────────────────

export type NotifyAudience = { staffId: string; role?: never } | { role: string; staffId?: never };

export interface NotifyInput {
  /** Single staff target — provide either staffId OR role, not both */
  staffId?: string;
  /** Expand to all staff with this role */
  role?: string;
  eventType: string;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  /** Optional deduplication key — prevents duplicate rows per (staff, eventType, dedupeKey) */
  dedupeKey?: string;
}

// ── Email job payload ─────────────────────────────────────────────────────────

export interface EmailJobData {
  notificationId: string;
  staffId: string;
  eventType: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
}

// ── Slack job payload ─────────────────────────────────────────────────────────

export interface SlackJobData {
  notificationId: string;
  eventType: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fan-out a notification to one or more staff members:
 *  1. Resolve audience (staffId or role → ids list)
 *  2. For each staff: check pref category opt-in → INSERT → Socket.io + queues
 *
 * Critical audience rule: severity=critical always includes admins regardless of prefs.
 * Safe to call after DB commit — never called inside a transaction.
 */
export async function notifyStaff(
  db: Db,
  io: SocketIOServer,
  input: NotifyInput,
  emailQueue: Queue<EmailJobData>,
  slackQueue: Queue<SlackJobData>
): Promise<void> {
  if (!isEnabled()) return;

  const { eventType, severity, title, body, payload, dedupeKey } = input;

  // 1. Resolve audience
  let staffIds: string[] = [];

  if (input.staffId) {
    staffIds = [input.staffId];
  } else if (input.role) {
    staffIds = await getStaffIdsByRole(db, input.role as Parameters<typeof getStaffIdsByRole>[1]);
  }

  if (staffIds.length === 0) return;

  // For critical events: ensure admins are always included
  if (severity === 'critical') {
    const adminIds = await getStaffIdsByRole(db, 'admin');
    const merged = new Set([...staffIds, ...adminIds]);
    staffIds = Array.from(merged);
  }

  // 2. Resolve pref category
  const category = getPrefCategory(eventType);

  // 3. Process each staff member
  await Promise.all(
    staffIds.map(async (staffId) => {
      try {
        await processSingleStaff(db, io, {
          staffId,
          eventType,
          severity,
          title,
          body: body ?? null,
          payload: payload ?? null,
          dedupeKey: dedupeKey ?? null,
          category,
          emailQueue,
          slackQueue,
        });
      } catch (err) {
        // Non-fatal: log and continue for other recipients
        console.error('[notify-staff] Failed for staffId=%s err=%s', staffId, err);
      }
    })
  );
}

// ── Per-staff processing ──────────────────────────────────────────────────────

interface StaffProcessInput {
  staffId: string;
  eventType: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  dedupeKey: string | null;
  category: PrefCategory | null;
  emailQueue: Queue<EmailJobData>;
  slackQueue: Queue<SlackJobData>;
}

async function processSingleStaff(
  db: Db,
  io: SocketIOServer,
  input: StaffProcessInput
): Promise<void> {
  const { staffId, eventType, severity, title, body, payload, dedupeKey, category } = input;

  // Load prefs
  const prefs = await getStaffPrefs(db, staffId);

  // Check event-type category opt-in (skip if pref turned off)
  if (category && !prefs.eventTypes[category]) return;

  // INSERT notification row — ON CONFLICT DO NOTHING for dedupeKey rows
  const [row] = await db
    .insert(schema.notifications)
    .values({
      staffId,
      eventType,
      severity,
      title,
      body,
      payload: payload as schema.NewNotification['payload'],
      dedupeKey,
    })
    .onConflictDoNothing()
    .returning();

  // If dedupeKey row already existed, row is undefined — nothing more to do
  if (!row) return;

  // In-app: emit Socket.io to staff-private room
  if (prefs.inApp) {
    emitNotifCreated(io, row);
  }

  const jobOpts = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1_000 },
  };

  const emailJob: EmailJobData = {
    notificationId: row.id,
    staffId,
    eventType,
    severity,
    title,
    body,
    payload,
  };

  const slackJob: SlackJobData = {
    notificationId: row.id,
    eventType,
    severity,
    title,
    body,
    payload,
  };

  // Email: immediate for critical; non-critical left for hourly digest
  if (prefs.email && severity === 'critical') {
    await input.emailQueue.add(EMAIL_IMMEDIATE_QUEUE, emailJob, {
      ...jobOpts,
      jobId: `email_imm:${row.id}`,
    });
  }

  // Slack: only for critical events
  if (prefs.slack && severity === 'critical') {
    await input.slackQueue.add('notif_slack', slackJob, {
      ...jobOpts,
      jobId: `slack:${row.id}`,
    });
  }
}

// ── Re-export queue name constants for workers ────────────────────────────────

export { EMAIL_IMMEDIATE_QUEUE as NOTIF_EMAIL_IMMEDIATE_QUEUE };
