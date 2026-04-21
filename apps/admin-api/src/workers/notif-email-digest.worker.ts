// notif-email-digest.worker — BullMQ repeatable worker for hourly email digest.
// Runs at :00 every hour via BullMQ cron (pattern: '0 * * * *').
// Scans unread non-critical notifications since last digest, groups by staff,
// renders HTML digest, sends via SMTP, marks rows as digest_sent.
// NOTIFICATIONS_DRY_RUN=true → logs payload, no SMTP call.
import { Worker } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import type { Db } from '../db/index.js';
import {
  fetchDigestGroups,
  markDigestSent,
  renderDigestHtml,
} from '../services/notif-digest-aggregator.service.js';
import type { SmtpConfig } from '../services/notif-email-transport.service.js';
import { isDryRun, sendEmail } from '../services/notif-email-transport.service.js';

// ── Queue/job names ───────────────────────────────────────────────────────────

export const DIGEST_QUEUE = 'notif_email_digest';
export const DIGEST_JOB_NAME = 'digest-hourly';

// ── Worker factory ────────────────────────────────────────────────────────────

export function createEmailDigestWorker(
  db: Db,
  smtpCfg: SmtpConfig,
  redisOpts: RedisOptions
): Worker {
  const worker = new Worker(
    DIGEST_QUEUE,
    async () => {
      const groups = await fetchDigestGroups(db);

      if (groups.length === 0) {
        // Nothing to digest this hour — skip silently
        return;
      }

      for (const group of groups) {
        const { email, name, rows, staffId } = group;
        const notifIds = rows.map((r) => r.id);

        if (isDryRun()) {
          console.info(
            '[email-digest] DRY_RUN staffId=%s email=%s rows=%d',
            staffId,
            email,
            rows.length,
            { dryRun: true }
          );
          await markDigestSent(db, notifIds);
          continue;
        }

        try {
          const html = renderDigestHtml(name, rows);
          await sendEmail({
            to: email,
            subject: `Wallet Portal — ${rows.length} notification${rows.length !== 1 ? 's' : ''} (hourly digest)`,
            html,
            cfg: smtpCfg,
          });
          await markDigestSent(db, notifIds);
        } catch (err) {
          // Log per-staff failure but continue with remaining staff
          console.error('[email-digest] Failed for staffId=%s err=%s', staffId, err);
        }
      }
    },
    {
      connection: redisOpts,
      concurrency: 1, // digest is a heavy scan — single concurrency to avoid DB pressure
    }
  );

  worker.on('failed', (job, err) => {
    console.error('[email-digest] Job %s failed: %s', job?.id, err);
  });

  return worker;
}
