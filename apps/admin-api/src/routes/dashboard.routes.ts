// Dashboard routes — GET /dashboard/metrics (stub)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';

const MetricsSchema = z.object({
  aumUsdt: z.string(),
  aumUsdc: z.string(),
  pendingDeposits: z.number().int(),
  pendingWithdrawals: z.number().int(),
  pendingMultisigOps: z.number().int(),
  blockSyncBnb: z.number().int().nullable(),
  blockSyncSol: z.number().int().nullable(),
});

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/dashboard/metrics',
    {
      preHandler: requirePerm('dashboard.read'),
      schema: {
        tags: ['dashboard'],
        response: { 200: MetricsSchema },
      },
    },
    async (_req, reply) => {
      // Stub — real aggregation wired in P09
      return reply.code(200).send({
        aumUsdt: '0',
        aumUsdc: '0',
        pendingDeposits: 0,
        pendingWithdrawals: 0,
        pendingMultisigOps: 0,
        blockSyncBnb: null,
        blockSyncSol: null,
      });
    },
  );
};

export default dashboardRoutes;
