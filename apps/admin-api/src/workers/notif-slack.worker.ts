// notif-slack.worker — BullMQ worker for Slack webhook delivery.
// Processes jobs from queue `notif_slack` (enqueued by notifyStaff for severity=critical + prefs.slack=true).
// Concurrency: 5. Retries: 3 with exponential backoff.
// NOTIFICATIONS_DRY_RUN=true → logs payload, no webhook call.
// SLACK_WEBHOOK_URL masked in all error messages — never logged.
import { Worker } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { postSlackMessage } from '../services/notif-slack-client.service.js';
import { buildSlackPayload } from '../services/notif-templates.service.js';
import type { SlackJobData } from '../services/notify-staff.service.js';
import { SLACK_WEBHOOK_QUEUE } from '../services/notify-staff.service.js';

export function createSlackWorker(
  webhookUrl: string,
  redisOpts: RedisOptions
): Worker<SlackJobData> {
  const worker = new Worker<SlackJobData>(
    SLACK_WEBHOOK_QUEUE,
    async (job) => {
      const { text, blocks } = buildSlackPayload(job.data);
      await postSlackMessage({ text, blocks, webhookUrl });
    },
    {
      connection: redisOpts,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    // Mask webhook URL in logs — only log job id + sanitised error
    console.error(
      '[notif-slack] Job %s failed: %s',
      job?.id,
      String(err).replace(webhookUrl, '<webhook>')
    );
  });

  return worker;
}
