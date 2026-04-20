// Health routes — GET /health/live (liveness) + GET /health/ready (readiness)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

const LiveSchema = z.object({ status: z.literal('ok') });
const ReadySchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'error']),
  redis: z.enum(['ok', 'error']),
});

const healthRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Liveness — is the process alive? No dependency checks.
  r.get(
    '/health/live',
    {
      schema: {
        tags: ['health'],
        response: { 200: LiveSchema },
      },
    },
    async (_req, reply) => {
      return reply.code(200).send({ status: 'ok' });
    },
  );

  // Readiness — can the process serve traffic? Check DB + Redis.
  r.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        response: {
          200: ReadySchema,
          503: ReadySchema,
        },
      },
    },
    async (_req, reply) => {
      let dbStatus: 'ok' | 'error' = 'ok';
      let redisStatus: 'ok' | 'error' = 'ok';

      // DB check — lightweight query
      try {
        await app.db.execute('select 1' as unknown as Parameters<typeof app.db.execute>[0]);
      } catch {
        dbStatus = 'error';
      }

      // Redis check
      try {
        await app.redis.ping();
      } catch {
        redisStatus = 'error';
      }

      const degraded = dbStatus === 'error' || redisStatus === 'error';
      const code = degraded ? 503 : 200;

      return reply.code(code).send({
        status: degraded ? 'degraded' : 'ok',
        db: dbStatus,
        redis: redisStatus,
      });
    },
  );
};

export default healthRoutes;
