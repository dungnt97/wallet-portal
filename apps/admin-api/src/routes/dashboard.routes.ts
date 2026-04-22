import { and, count, eq, inArray, sum } from 'drizzle-orm';
// Dashboard routes — GET /dashboard/metrics + GET /dashboard/nav-counts + GET /dashboard/history
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import { getDashboardHistory } from '../services/dashboard-history.service.js';

const MetricsSchema = z.object({
  aumUsdt: z.string(),
  aumUsdc: z.string(),
  aumBreakdown: z.object({
    usdtBnb: z.string(),
    usdcBnb: z.string(),
    usdtSol: z.string(),
    usdcSol: z.string(),
  }),
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

      // AUM breakdown per (token, chain) — 4 cells
      const [usdtBnb, usdcBnb, usdtSol, usdcSol] = await Promise.all([
        app.db
          .select({ total: sum(schema.deposits.amount) })
          .from(schema.deposits)
          .where(and(eq(schema.deposits.token, 'USDT'), eq(schema.deposits.chain, 'bnb'))),
        app.db
          .select({ total: sum(schema.deposits.amount) })
          .from(schema.deposits)
          .where(and(eq(schema.deposits.token, 'USDC'), eq(schema.deposits.chain, 'bnb'))),
        app.db
          .select({ total: sum(schema.deposits.amount) })
          .from(schema.deposits)
          .where(and(eq(schema.deposits.token, 'USDT'), eq(schema.deposits.chain, 'sol'))),
        app.db
          .select({ total: sum(schema.deposits.amount) })
          .from(schema.deposits)
          .where(and(eq(schema.deposits.token, 'USDC'), eq(schema.deposits.chain, 'sol'))),
      ]);
      const aumBreakdown = {
        usdtBnb: usdtBnb[0]?.total ?? '0',
        usdcBnb: usdcBnb[0]?.total ?? '0',
        usdtSol: usdtSol[0]?.total ?? '0',
        usdcSol: usdcSol[0]?.total ?? '0',
      };
      // Drizzle sum() returns decimal strings (e.g. "10000.000000000000000000") — strip
      // the fractional part before BigInt conversion to avoid SyntaxError on decimals.
      const toBigIntSafe = (v: string) => BigInt(v ? (v.split('.')[0] ?? '0') : '0');
      const aggTotal = (a: string, b: string) => (toBigIntSafe(a) + toBigIntSafe(b)).toString();

      return reply.code(200).send({
        aumUsdt: aggTotal(aumBreakdown.usdtBnb, aumBreakdown.usdtSol),
        aumUsdc: aggTotal(aumBreakdown.usdcBnb, aumBreakdown.usdcSol),
        aumBreakdown,
        pendingDeposits: Number(pendingDepositStats?.cnt ?? 0),
        pendingDepositsValue: pendingDepositStats?.total ?? '0',
        pendingWithdrawals: Number(pendingWithdrawalStats?.cnt ?? 0),
        pendingMultisigOps: Number(pendingMultisigStats?.cnt ?? 0),
        blockSyncBnb: null,
        blockSyncSol: null,
      });
    }
  );

  // ── GET /dashboard/nav-counts — sidebar badge counts ─────────────────────────
  // Polled every 30s by use-sidebar-counts hook; also refreshed on socket events.
  r.get(
    '/dashboard/nav-counts',
    {
      preHandler: requirePerm('dashboard.read'),
      schema: {
        tags: ['dashboard'],
        response: {
          200: z.object({
            deposits: z.number().int(),
            sweep: z.number().int(),
            withdrawals: z.number().int(),
            multisig: z.number().int(),
            recovery: z.number().int(),
          }),
        },
      },
    },
    async (_req, reply) => {
      const [depositCount, sweepCount, withdrawalCount, multisigCount, recoveryCount] =
        await Promise.all([
          // Deposits: pending only
          app.db
            .select({ cnt: count() })
            .from(schema.deposits)
            .where(eq(schema.deposits.status, 'pending'))
            .then((r) => Number(r[0]?.cnt ?? 0)),

          // Sweep: in-progress (pending sweeps)
          app.db
            .select({ cnt: count() })
            .from(schema.sweeps)
            .where(eq(schema.sweeps.status, 'pending'))
            .then((r) => Number(r[0]?.cnt ?? 0)),

          // Withdrawals: pending + approved + time_locked
          app.db
            .select({ cnt: count() })
            .from(schema.withdrawals)
            .where(inArray(schema.withdrawals.status, ['pending', 'approved', 'time_locked']))
            .then((r) => Number(r[0]?.cnt ?? 0)),

          // Multisig: collecting + ready ops
          app.db
            .select({ cnt: count() })
            .from(schema.multisigOperations)
            .where(inArray(schema.multisigOperations.status, ['collecting', 'ready', 'pending']))
            .then((r) => Number(r[0]?.cnt ?? 0)),

          // Recovery: failed sweeps needing attention
          app.db
            .select({ cnt: count() })
            .from(schema.sweeps)
            .where(eq(schema.sweeps.status, 'failed'))
            .then((r) => Number(r[0]?.cnt ?? 0)),
        ]);

      return reply.code(200).send({
        deposits: depositCount,
        sweep: sweepCount,
        withdrawals: withdrawalCount,
        multisig: multisigCount,
        recovery: recoveryCount,
      });
    }
  );
  // ── GET /dashboard/history — time-bucketed series for chart ─────────────────
  // Returns real data from ledger_entries / deposits / withdrawals tables.
  // query: metric=aum|deposits|withdrawals, range=24h|7d|30d|90d
  r.get(
    '/dashboard/history',
    {
      preHandler: requirePerm('dashboard.read'),
      schema: {
        tags: ['dashboard'],
        querystring: z.object({
          metric: z.enum(['aum', 'deposits', 'withdrawals']),
          range: z.enum(['24h', '7d', '30d', '90d']),
        }),
        response: {
          200: z.object({
            metric: z.enum(['aum', 'deposits', 'withdrawals']),
            range: z.enum(['24h', '7d', '30d', '90d']),
            points: z.array(
              z.object({
                t: z.string(),
                v: z.number(),
              })
            ),
          }),
        },
      },
    },
    async (req, reply) => {
      const { metric, range } = req.query;
      const result = await getDashboardHistory(app.db, metric, range);
      return reply.code(200).send(result);
    }
  );
};

export default dashboardRoutes;
