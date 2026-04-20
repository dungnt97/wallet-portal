// Wallets routes — GET /wallets (stub)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import { Wallet } from '@wp/shared-types';

const walletsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/wallets',
    {
      preHandler: requirePerm('wallets.read'),
      schema: {
        tags: ['wallets'],
        querystring: z.object({
          chain: z.enum(['bnb', 'sol']).optional(),
          tier: z.enum(['hot', 'cold']).optional(),
          purpose: z.enum(['deposit_hd', 'operational', 'cold_reserve']).optional(),
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
        }),
        response: {
          200: z.object({ data: z.array(Wallet), total: z.number().int(), page: z.number().int() }),
        },
      },
    },
    async (_req, reply) => reply.code(200).send({ data: [], total: 0, page: 1 }),
  );
};

export default walletsRoutes;
