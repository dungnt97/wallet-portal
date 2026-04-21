import { Queue } from 'bullmq';
import type { FastifyPluginAsync } from 'fastify';
// BullMQ queue plugin — decorates app.queue (withdrawal_execute), app.sweepQueue (sweep_execute),
// app.coldTimelockQueue (cold_timelock_broadcast, Slice 7),
// app.emailQueue (notif_email_immediate, Slice 5), app.slackQueue (notif_slack, Slice 5),
// app.smsQueue (notif_sms, Phase 11), app.ceremonyQueue (signer_ceremony, Slice 6),
// app.reconQueue (reconciliation-run, Slice 10)
import fp from 'fastify-plugin';
import { EMAIL_IMMEDIATE_QUEUE, SLACK_WEBHOOK_QUEUE } from '../services/notify-staff.service.js';
import { COLD_TIMELOCK_QUEUE } from '../services/withdrawal-create.service.js';
import { SMS_QUEUE } from '../workers/notif-sms.worker.js';
import {
  RECON_RUN_QUEUE,
  registerReconRepeatableJobs,
} from '../workers/reconciliation-snapshot.worker.js';

const queuePlugin: FastifyPluginAsync = async (app) => {
  // Reuse app.redis connection options; BullMQ needs its own connection per docs
  const redisOpts = app.redis.options;

  const connOpts = {
    host: redisOpts.host ?? 'localhost',
    port: redisOpts.port ?? 6379,
    password: redisOpts.password,
  };

  // Queue name must match wallet-engine's WITHDRAWAL_EXECUTE_QUEUE_NAME consumer
  const queue = new Queue('withdrawal_execute', { connection: connOpts });

  // Sweep execute queue — consumed by wallet-engine sweep-execute-worker
  const sweepQueue = new Queue('sweep_execute', { connection: connOpts });

  // Cold timelock broadcast queue — consumed by wallet-engine cold-timelock-broadcast worker (Slice 7)
  const coldTimelockQueue = new Queue(COLD_TIMELOCK_QUEUE, { connection: connOpts });

  // Notification queues (Slice 5 + Phase 11)
  const emailQueue = new Queue(EMAIL_IMMEDIATE_QUEUE, { connection: connOpts });
  const slackQueue = new Queue(SLACK_WEBHOOK_QUEUE, { connection: connOpts });
  const smsQueue = new Queue(SMS_QUEUE, { connection: connOpts });

  // Signer ceremony broadcast queue (Slice 6) — consumed by wallet-engine ceremony worker
  const ceremonyQueue = new Queue('signer_ceremony', { connection: connOpts });

  // Reconciliation run queue (Slice 10) — ad-hoc + cron repeatable jobs
  const reconQueue = new Queue(RECON_RUN_QUEUE, { connection: connOpts });

  app.decorate('queue', queue);
  app.decorate('sweepQueue', sweepQueue);
  app.decorate('coldTimelockQueue', coldTimelockQueue);
  app.decorate('emailQueue', emailQueue);
  app.decorate('slackQueue', slackQueue);
  app.decorate('smsQueue', smsQueue);
  app.decorate('ceremonyQueue', ceremonyQueue);
  app.decorate('reconQueue', reconQueue);

  // Register repeatable cron + GC jobs (idempotent — safe on every restart)
  await registerReconRepeatableJobs(reconQueue);

  app.addHook('onClose', async () => {
    await queue.close();
    await sweepQueue.close();
    await coldTimelockQueue.close();
    await emailQueue.close();
    await slackQueue.close();
    await smsQueue.close();
    await ceremonyQueue.close();
    await reconQueue.close();
  });
};

export default fp(queuePlugin, { name: 'queue', dependencies: ['redis'] });
