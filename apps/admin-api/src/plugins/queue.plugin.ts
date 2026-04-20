// BullMQ queue plugin — decorates app.queue with a producer Queue instance
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { Queue } from 'bullmq';

const queuePlugin: FastifyPluginAsync = async (app) => {
  // Reuse app.redis connection options; BullMQ needs its own connection per docs
  const redisOpts = app.redis.options;

  const queue = new Queue('admin-api', {
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
