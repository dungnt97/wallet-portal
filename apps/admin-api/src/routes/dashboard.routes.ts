// Dashboard routes — GET /dashboard/metrics with real aggregations (wired P09)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq, count, sum } from 'drizzle-orm';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';

const MetricsSchema = z.object({
  aumUsdt: z.string(),
  aumUsdc: z.string(),
  pendingDeposits: z.number().int(),
  pendingDepositsValue: z.string(),
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
      // Count + sum pending deposits
      const [pendingDepositStats] = await app.db
        .select({
          cnt: count(),
          total: sum(schema.deposits.amount),
        })
        .from(schema.deposits)
        .where(eq(schema.deposits.status, 'pending'));

      // Count pending withdrawals
      const [pendingWithdrawalStats] = await app.db
        .select({ cnt: count() })
        .from(schema.withdrawals)
        .where(eq(schema.withdrawals.status, 'pending'));

      // Count pending multisig operations
      const [pendingMultisigStats] = await app.db
        .select({ cnt: count() })
        .from(schema.multisigOperations)
        .where(eq(schema.multisigOperations.status, 'pending'));

      // AUM = sum of all credited user balances (ledger credit side, simplified: sum of credited deposits)
      const [aumUsdt] = await app.db
        .select({ total: sum(schema.deposits.amount) })
        .from(schema.deposits)
        .where(eq(schema.deposits.token, 'USDT'));

      const [aumUsdc] = await app.db
        .select({ total: sum(schema.deposits.amount) })
        .from(schema.deposits)
        .where(eq(schema.deposits.token, 'USDC'));

      return reply.code(200).send({
        aumUsdt: aumUsdt?.total ?? '0',
        aumUsdc: aumUsdc?.total ?? '0',
        pendingDeposits: Number(pendingDepositStats?.cnt ?? 0),
        pendingDepositsValue: pendingDepositStats?.total ?? '0',
        pendingWithdrawals: Number(pendingWithdrawalStats?.cnt ?? 0),
        pendingMultisigOps: Number(pendingMultisigStats?.cnt ?? 0),
        blockSyncBnb: null,
        blockSyncSol: null,
      });
    },
  );
};

export default dashboardRoutes;
