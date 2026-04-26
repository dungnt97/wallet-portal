// notif-sms.worker — BullMQ worker for Twilio SMS delivery.
// Processes jobs from queue `notif_sms` (enqueued by notifyStaff for severity=critical + prefs.sms=true).
// Concurrency: 5. Retries: 3 with exponential backoff.
//
// Dry-run mode (no Twilio creds, non-production):
//   When TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER are absent
//   and NODE_ENV != production, the worker logs the SMS payload at info level and
//   skips the API call. No error is raised.
//
// Production creds-missing behaviour:
//   When creds are absent in production the job is dropped with an error-level log
//   and the notif_sms_dropped_total{reason="creds_missing"} Prometheus counter is
//   incremented so on-call alerts can fire.
//
// Production setup:
//   TWILIO_ACCOUNT_SID=ACxxxxx
//   TWILIO_AUTH_TOKEN=xxxxx
//   TWILIO_FROM_NUMBER=+1415xxxxxxx
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { RedisOptions } from 'ioredis';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { notifSmsDroppedTotal } from '../telemetry/metrics.js';

export const SMS_QUEUE = 'notif_sms';

export interface SmsJobData {
  notificationId: string;
  staffId: string;
  title: string;
  body: string | null;
  severity: string;
}

/** Returns true when all three Twilio env vars are set. */
function hasTwilioCreds(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

/**
 * Send an SMS via Twilio REST API (no SDK dependency — plain fetch).
 * Throws on non-2xx response.
 */
async function sendTwilioSms(to: string, body: string): Promise<void> {
  // Guarded by hasTwilioCreds() check before call — these are always defined here
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const from = process.env.TWILIO_FROM_NUMBER as string;

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const credentials = Buffer.from(`${sid}:${token}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Twilio SMS failed (${res.status}): ${text}`);
  }
}

export function createSmsWorker(db: Db, redisOpts: RedisOptions): Worker<SmsJobData> {
  const worker = new Worker<SmsJobData>(
    SMS_QUEUE,
    async (job) => {
      const { staffId, title, body, severity } = job.data;

      // Resolve phone number
      const staff = await db.query.staffMembers.findFirst({
        where: eq(schema.staffMembers.id, staffId),
        columns: { phoneNumber: true, name: true },
      });

      if (!staff?.phoneNumber) {
        // No phone number on file — discard silently
        console.warn('[notif-sms] Staff %s has no phone_number — discarding job', staffId);
        return;
      }

      const messageBody = `[${severity.toUpperCase()}] ${title}${body ? `\n${body}` : ''}`;

      if (!hasTwilioCreds()) {
        if (process.env.NODE_ENV === 'production') {
          // Production: missing Twilio creds is an operator error — log at error
          // level and increment the Prometheus counter so alerts can fire.
          console.error(
            '[notif-sms] Twilio creds missing in production — dropping SMS job %s (severity=%s)',
            job.id,
            severity
          );
          notifSmsDroppedTotal.inc({ reason: 'creds_missing' });
        } else {
          // Non-production dry-run — log payload at info level and skip silently.
          console.info(
            '[notif-sms] DRY_RUN to=%s body=%s',
            staff.phoneNumber.replace(/\d(?=\d{4})/g, '*'),
            messageBody
          );
        }
        return;
      }

      await sendTwilioSms(staff.phoneNumber, messageBody);
    },
    {
      connection: redisOpts,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    // Mask phone number in logs
    console.error(
      '[notif-sms] Job %s failed: %s',
      job?.id,
      String(err).replace(/\+\d+/g, '<phone>')
    );
  });

  return worker;
}
