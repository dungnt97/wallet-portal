import { Queue } from 'bullmq';
import type { FastifyPluginAsync } from 'fastify';
// BullMQ queue plugin — decorates app.queue (withdrawal_execute), app.sweepQueue (sweep_execute),
// app.coldTimelockQueue (cold_timelock_broadcast, Slice 7),
// app.emailQueue (notif_email_immediate, Slice 5), app.slackQueue (notif_slack, Slice 5)
import fp from 'fastify-plugin';
import { EMAIL_IMMEDIATE_QUEUE, SLACK_WEBHOOK_QUEUE } from '../services/notify-staff.service.js';
import { COLD_TIMELOCK_QUEUE } from '../services/withdrawal-create.service.js';

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

  // Notification queues (Slice 5)
  const emailQueue = new Queue(EMAIL_IMMEDIATE_QUEUE, { connection: connOpts });
  const slackQueue = new Queue(SLACK_WEBHOOK_QUEUE, { connection: connOpts });

  app.decorate('queue', queue);
  app.decorate('sweepQueue', sweepQueue);
  app.decorate('coldTimelockQueue', coldTimelockQueue);
  app.decorate('emailQueue', emailQueue);
  app.decorate('slackQueue', slackQueue);

  app.addHook('onClose', async () => {
    await queue.close();
    await sweepQueue.close();
    await coldTimelockQueue.close();
    await emailQueue.close();
    await slackQueue.close();
  });
};

export default fp(queuePlugin, { name: 'queue', dependencies: ['redis'] });
