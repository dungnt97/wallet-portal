import type { FastifyPluginAsync } from 'fastify';
// Redis plugin — decorates app.redis with an ioredis client
import fp from 'fastify-plugin';
import Redis from 'ioredis';
import type { Config } from '../config/env.js';

const redisPlugin: FastifyPluginAsync<Pick<Config, 'REDIS_URL'>> = async (app, opts) => {
  const redis = new Redis(opts.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });

  await redis.connect().catch((err: unknown) => {
    // Non-fatal in dev — health/ready will report degraded
    app.log.warn({ err }, 'Redis connect failed — continuing in degraded mode');
  });

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    await redis.quit();
  });
};

export default fp(redisPlugin, { name: 'redis' });
