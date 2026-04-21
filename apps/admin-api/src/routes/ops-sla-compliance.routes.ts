// Ops SLA + Compliance summary endpoints.
// GET /ops/sla-summary    — p95 latency aggregates over last 24h from DB
// GET /ops/compliance-summary — KYC tier counts + risk tier counts from users table
import { and, count, eq, gte, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';

const SlaSummarySchema = z.object({
  // Deposit: median seconds from createdAt → updatedAt (when credited)
  depositCreditP50Sec: z.number().nullable(),
  // Sweep: median seconds from createdAt → confirmedAt
  sweepConfirmP50Sec: z.number().nullable(),
  // Counts for the last 24h window
  depositsLast24h: z.number().int(),
  sweepsLast24h: z.number().int(),
  withdrawalsLast24h: z.number().int(),
  // Pending queue depths (real-time)
  pendingDeposits: z.number().int(),
  pendingSweeps: z.number().int(),
  pendingWithdrawals: z.number().int(),
});

const ComplianceSummarySchema = z.object({
  // KYC tier distribution
  kycNone: z.number().int(),
  kycBasic: z.number().int(),
  kycEnhanced: z.number().int(),
  // Risk tier distribution
  riskLow: z.number().int(),
  riskMedium: z.number().int(),
  riskHigh: z.number().int(),
  riskFrozen: z.number().int(),
  // Users by status
  activeUsers: z.number().int(),
  suspendedUsers: z.number().int(),
  totalUsers: z.number().int(),
});

const opsSlaComplianceRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── GET /ops/sla-summary ─────────────────────────────────────────────────────
  r.get(
    '/ops/sla-summary',
    {
      preHandler: requirePerm('dashboard.read'),
      schema: {
        tags: ['ops'],
        response: { 200: SlaSummarySchema },
      },
    },
    async (_req, reply) => {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [
        depositCredit,
        sweepConfirm,
        depositsCount,
        sweepsCount,
        withdrawalsCount,
        pendingDep,
        pendingSweep,
        pendingWd,
      ] = await Promise.all([
        // Median deposit credit latency: credited deposits in last 24h
        app.db
          .select({
            median: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at)))`,
          })
          .from(schema.deposits)
          .where(
            and(eq(schema.deposits.status, 'credited'), gte(schema.deposits.updatedAt, since24h))
          )
          .then((r) => r[0]?.median ?? null),

        // Median sweep confirm latency: confirmed sweeps in last 24h
        app.db
          .select({
            median: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (confirmed_at - created_at)))`,
          })
          .from(schema.sweeps)
          .where(and(eq(schema.sweeps.status, 'confirmed'), gte(schema.sweeps.createdAt, since24h)))
          .then((r) => r[0]?.median ?? null),

        // Total deposits last 24h
        app.db
          .select({ cnt: count() })
          .from(schema.deposits)
          .where(gte(schema.deposits.createdAt, since24h))
          .then((r) => Number(r[0]?.cnt ?? 0)),

        // Total sweeps last 24h
        app.db
          .select({ cnt: count() })
          .from(schema.sweeps)
          .where(gte(schema.sweeps.createdAt, since24h))
          .then((r) => Number(r[0]?.cnt ?? 0)),

        // Total withdrawals last 24h
        app.db
          .select({ cnt: count() })
          .from(schema.withdrawals)
          .where(gte(schema.withdrawals.createdAt, since24h))
          .then((r) => Number(r[0]?.cnt ?? 0)),

        // Pending deposits
        app.db
          .select({ cnt: count() })
          .from(schema.deposits)
          .where(eq(schema.deposits.status, 'pending'))
          .then((r) => Number(r[0]?.cnt ?? 0)),

        // Pending sweeps
        app.db
          .select({ cnt: count() })
          .from(schema.sweeps)
          .where(eq(schema.sweeps.status, 'pending'))
          .then((r) => Number(r[0]?.cnt ?? 0)),

        // Pending withdrawals
        app.db
          .select({ cnt: count() })
          .from(schema.withdrawals)
          .where(eq(schema.withdrawals.status, 'pending'))
          .then((r) => Number(r[0]?.cnt ?? 0)),
      ]);

      return reply.code(200).send({
        depositCreditP50Sec: depositCredit !== null ? Math.round(Number(depositCredit)) : null,
        sweepConfirmP50Sec: sweepConfirm !== null ? Math.round(Number(sweepConfirm)) : null,
        depositsLast24h: depositsCount,
        sweepsLast24h: sweepsCount,
        withdrawalsLast24h: withdrawalsCount,
        pendingDeposits: pendingDep,
        pendingSweeps: pendingSweep,
        pendingWithdrawals: pendingWd,
      });
    }
  );

  // ── GET /ops/compliance-summary ──────────────────────────────────────────────
  r.get(
    '/ops/compliance-summary',
    {
      preHandler: requirePerm('dashboard.read'),
      schema: {
        tags: ['ops'],
        response: { 200: ComplianceSummarySchema },
      },
    },
    async (_req, reply) => {
      const [kycRows, riskRows, statusRows] = await Promise.all([
        // KYC tier distribution
        app.db
          .select({ tier: schema.users.kycTier, cnt: count() })
          .from(schema.users)
          .groupBy(schema.users.kycTier),

        // Risk tier distribution
        app.db
          .select({ tier: schema.users.riskTier, cnt: count() })
          .from(schema.users)
          .groupBy(schema.users.riskTier),

        // Active / suspended counts
        app.db
          .select({ status: schema.users.status, cnt: count() })
          .from(schema.users)
          .groupBy(schema.users.status),
      ]);

      const kyc: Record<string, number> = {};
      for (const row of kycRows) kyc[row.tier] = Number(row.cnt);

      const risk: Record<string, number> = {};
      for (const row of riskRows) risk[row.tier] = Number(row.cnt);

      const status: Record<string, number> = {};
      for (const row of statusRows) status[row.status] = Number(row.cnt);

      const totalUsers = Object.values(status).reduce((s, v) => s + v, 0);

      return reply.code(200).send({
        kycNone: kyc.none ?? 0,
        kycBasic: kyc.basic ?? 0,
        kycEnhanced: kyc.enhanced ?? 0,
        riskLow: risk.low ?? 0,
        riskMedium: risk.medium ?? 0,
        riskHigh: risk.high ?? 0,
        riskFrozen: risk.frozen ?? 0,
        activeUsers: status.active ?? 0,
        suspendedUsers: status.suspended ?? 0,
        totalUsers,
      });
    }
  );
};

export default opsSlaComplianceRoutes;
