// notif-digest-aggregator.service — groups unread, undigested notifications per staff member
// and builds a single HTML digest email. Called by the hourly digest BullMQ worker.
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import type { NotificationRow } from '../db/schema/notifications.js';

// ── Query ─────────────────────────────────────────────────────────────────────

export interface DigestGroup {
  staffId: string;
  email: string;
  name: string;
  rows: NotificationRow[];
}

/**
 * Fetch all staff members who have at least one unread, un-digested, non-critical
 * notification within the last 2 hours, grouped by staff.
 *
 * Skips critical rows — those are sent immediately by the email-immediate worker.
 */
export async function fetchDigestGroups(db: Db): Promise<DigestGroup[]> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h lookback

  // Fetch pending digest rows: unread, no digestSentAt, non-critical, recent
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(
      and(
        isNull(schema.notifications.readAt),
        isNull(schema.notifications.digestSentAt),
        sql`${schema.notifications.severity} != 'critical'`,
        sql`${schema.notifications.createdAt} > ${cutoff}`
      )
    )
    .orderBy(schema.notifications.staffId, schema.notifications.createdAt);

  if (rows.length === 0) return [];

  // Group by staffId
  const byStaff = new Map<string, NotificationRow[]>();
  for (const row of rows) {
    const list = byStaff.get(row.staffId) ?? [];
    list.push(row);
    byStaff.set(row.staffId, list);
  }

  // Fetch staff details for all relevant staff IDs in one query
  const staffIds = Array.from(byStaff.keys());
  const staffRows = await db
    .select({
      id: schema.staffMembers.id,
      email: schema.staffMembers.email,
      name: schema.staffMembers.name,
    })
    .from(schema.staffMembers)
    .where(
      sql`${schema.staffMembers.id} = ANY(${sql.raw(`ARRAY[${staffIds.map((id) => `'${id}'`).join(',')}]::uuid[]`)})`
    )
    .execute();

  const staffMap = new Map(staffRows.map((s) => [s.id, s]));

  const groups: DigestGroup[] = [];
  for (const [staffId, notifRows] of byStaff) {
    const staff = staffMap.get(staffId);
    if (!staff) continue; // staff deleted — skip
    // Check prefs: only digest if email=true
    const staffFull = await db.query.staffMembers.findFirst({
      where: eq(schema.staffMembers.id, staffId),
      columns: { notificationPrefs: true },
    });
    if (!staffFull?.notificationPrefs.email) continue;
    groups.push({ staffId, email: staff.email, name: staff.name, rows: notifRows });
  }

  return groups;
}

// ── Mark rows as digested ─────────────────────────────────────────────────────

/**
 * Mark a batch of notification IDs as digest-sent.
 * Uses a single UPDATE statement for efficiency.
 */
export async function markDigestSent(db: Db, notifIds: string[]): Promise<void> {
  if (notifIds.length === 0) return;
  await db
    .update(schema.notifications)
    .set({ digestSentAt: new Date() })
    .where(
      sql`${schema.notifications.id} = ANY(${sql.raw(`ARRAY[${notifIds.map((id) => `'${id}'`).join(',')}]::uuid[]`)})`
    );
}

// ── HTML template ─────────────────────────────────────────────────────────────

/** Escape HTML special chars to prevent XSS in email template */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a simple plain-HTML digest email (no MJML dependency).
 * Groups notifications by event-type category for readability.
 */
export function renderDigestHtml(name: string, rows: NotificationRow[]): string {
  // Group by eventType prefix for visual grouping
  const grouped = new Map<string, NotificationRow[]>();
  for (const row of rows) {
    const prefix = row.eventType.split('.')[0] ?? row.eventType;
    const list = grouped.get(prefix) ?? [];
    list.push(row);
    grouped.set(prefix, list);
  }

  const sections = Array.from(grouped.entries())
    .map(([prefix, items]) => {
      const rowsHtml = items
        .map(
          (r) => `
          <tr>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(r.createdAt.toISOString())}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(r.title)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(r.body ?? '')}</td>
          </tr>`
        )
        .join('');
      return `
        <h3 style="margin:16px 0 4px;color:#333;">${esc(prefix.toUpperCase())}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:4px 8px;text-align:left;">Time</th>
              <th style="padding:4px 8px;text-align:left;">Event</th>
              <th style="padding:4px 8px;text-align:left;">Detail</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Wallet Portal — Hourly Digest</title></head>
<body style="font-family:sans-serif;color:#222;max-width:700px;margin:0 auto;padding:16px;">
  <h2 style="color:#1a1a2e;">Wallet Portal — Hourly Notification Digest</h2>
  <p>Hi ${esc(name)}, here is your hourly activity summary (${rows.length} event${rows.length !== 1 ? 's' : ''}):</p>
  ${sections}
  <hr style="margin:24px 0;">
  <p style="font-size:11px;color:#888;">You received this because your notification preferences include email digest.
  Log in to adjust preferences.</p>
</body>
</html>`;
}
