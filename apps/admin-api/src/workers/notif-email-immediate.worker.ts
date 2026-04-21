// notif-email-immediate.worker — BullMQ worker for instant email delivery.
// Processes jobs from queue `notif_email_immediate` (enqueued by notifyStaff for severity=critical).
// Concurrency: 5. Retries: 3 with exponential backoff.
// NOTIFICATIONS_DRY_RUN=true → logs payload, no SMTP call.
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { RedisOptions } from 'ioredis';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { type SmtpConfig, isDryRun, sendEmail } from '../services/notif-email-transport.service.js';
import type { EmailJobData } from '../services/notify-staff.service.js';
import { EMAIL_IMMEDIATE_QUEUE } from '../services/notify-staff.service.js';

// ── HTML template for immediate critical emails ───────────────────────────────

/** Escape HTML special chars */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildCriticalEmailHtml(job: EmailJobData): string {
  const payloadJson = job.payload
    ? `<pre style="background:#f5f5f5;padding:8px;font-size:12px;overflow:auto;">${esc(JSON.stringify(job.payload, null, 2))}</pre>`
    : '';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>CRITICAL: ${esc(job.title)}</title></head>
<body style="font-family:sans-serif;color:#222;max-width:600px;margin:0 auto;padding:16px;">
  <div style="background:#c0392b;color:#fff;padding:12px 16px;border-radius:4px;">
    <strong>CRITICAL ALERT</strong>
  </div>
  <h2 style="margin-top:16px;">${esc(job.title)}</h2>
  ${job.body ? `<p>${esc(job.body)}</p>` : ''}
  <dl style="font-size:13px;">
    <dt style="font-weight:bold;">Event type</dt><dd>${esc(job.eventType)}</dd>
    <dt style="font-weight:bold;">Severity</dt><dd>${esc(job.severity)}</dd>
  </dl>
  ${payloadJson}
  <hr style="margin:24px 0;">
  <p style="font-size:11px;color:#888;">Wallet Portal automated alert — do not reply.</p>
</body>
</html>`;
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createEmailImmediateWorker(
  db: Db,
  smtpCfg: SmtpConfig,
  redisOpts: RedisOptions
): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    EMAIL_IMMEDIATE_QUEUE,
    async (job) => {
      const data = job.data;

      if (isDryRun()) {
        console.info(
          '[email-immediate] DRY_RUN notificationId=%s eventType=%s',
          data.notificationId,
          data.eventType,
          { dryRun: true, payload: data.payload }
        );
        return;
      }

      // Resolve staff email address
      const staff = await db.query.staffMembers.findFirst({
        where: eq(schema.staffMembers.id, data.staffId),
        columns: { email: true, name: true },
      });

      if (!staff) {
        // Staff deleted — discard job silently
        console.warn('[email-immediate] Staff %s not found — discarding job', data.staffId);
        return;
      }

      const html = buildCriticalEmailHtml(data);
      await sendEmail({
        to: staff.email,
        subject: `[CRITICAL] ${data.title}`,
        html,
        cfg: smtpCfg,
      });
    },
    {
      connection: redisOpts,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    console.error('[email-immediate] Job %s failed: %s', job?.id, err);
  });

  return worker;
}
