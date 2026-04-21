import { Queue } from 'bullmq';
import type { FastifyPluginAsync } from 'fastify';
// BullMQ queue plugin — decorates app.queue with a producer Queue instance
import fp from 'fastify-plugin';

const queuePlugin: FastifyPluginAsync = async (app) => {
  // Reuse app.redis connection options; BullMQ needs its own connection per docs
  const redisOpts = app.redis.options;

  // Queue name must match wallet-engine's WITHDRAWAL_EXECUTE_QUEUE_NAME consumer
  const queue = new Queue('withdrawal_execute', {
    connection: {
      host: redisOpts.host ?? 'localhost',
      port: redisOpts.port ?? 6379,
      password: redisOpts.password,
    },
  });

  app.decorate('queue', queue);

  app.addHook('onClose', async () => {
    await queue.close();
  });
};

export default fp(queuePlugin, { name: 'queue', dependencies: ['redis'] });
