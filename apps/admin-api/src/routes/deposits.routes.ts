// Deposits routes — GET /deposits, POST /deposits/:id/credit (stub; wired P09)
// Internal credit endpoint lives in internal.routes.ts (bearer auth, D4)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import { Deposit } from '@wp/shared-types';

const depositsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // GET /deposits — paginated list
  r.get(
    '/deposits',
    {
      preHandler: requirePerm('deposits.read'),
      schema: {
        tags: ['deposits'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          status: z.enum(['pending', 'credited', 'swept', 'failed']).optional(),
        }),
        response: {
          200: z.object({
            data: z.array(Deposit),
            total: z.number().int(),
            page: z.number().int(),
          }),
        },
      },
    },
    async (_req, reply) => {
      return reply.code(200).send({ data: [], total: 0, page: 1 });
    },
  );

  // GET /deposits/:id
  r.get(
    '/deposits/:id',
    {
      preHandler: requirePerm('deposits.read'),
      schema: {
        tags: ['deposits'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: Deposit,
          404: z.object({ code: z.string(), message: z.string() }),
          501: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (_req, reply) => {
      return reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Wired in P09' });
    },
  );
};

export default depositsRoutes;
