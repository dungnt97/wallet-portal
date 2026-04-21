import { Queue } from 'bullmq';
import type { FastifyPluginAsync } from 'fastify';
// BullMQ queue plugin — decorates app.queue (withdrawal_execute) + app.sweepQueue (sweep_execute)
import fp from 'fastify-plugin';

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

  app.decorate('queue', queue);
  app.decorate('sweepQueue', sweepQueue);

  app.addHook('onClose', async () => {
    await queue.close();
    await sweepQueue.close();
  });
};

export default fp(queuePlugin, { name: 'queue', dependencies: ['redis'] });
