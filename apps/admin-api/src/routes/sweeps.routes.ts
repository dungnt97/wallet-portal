// Sweeps routes — GET /sweeps, POST /sweeps/trigger (stubs)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';

const NOT_IMPL = z.object({ code: z.string(), message: z.string() });

const SweepSchema = z.object({
  id: z.string().uuid(),
  chain: z.enum(['bnb', 'sol']),
  status: z.enum(['pending', 'submitted', 'confirmed', 'failed']),
  amount: z.string(),
  createdAt: z.string().datetime(),
});

const sweepsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/sweeps',
    {
      preHandler: requirePerm('sweeps.read'),
      schema: {
        tags: ['sweeps'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
        }),
        response: { 200: z.object({ data: z.array(SweepSchema), total: z.number().int(), page: z.number().int() }) },
      },
    },
    async (_req, reply) => reply.code(200).send({ data: [], total: 0, page: 1 }),
  );

  r.post(
    '/sweeps/trigger',
    {
      preHandler: requirePerm('sweeps.trigger'),
      schema: {
        tags: ['sweeps'],
        body: z.object({ chain: z.enum(['bnb', 'sol']) }),
        response: { 501: NOT_IMPL },
      },
    },
    async (_req, reply) => reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Wired in P09' }),
  );
};

export default sweepsRoutes;
