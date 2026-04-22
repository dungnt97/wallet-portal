import type { Queue } from 'bullmq';
import { and, count, desc, eq, gte, sum } from 'drizzle-orm';
// Sweeps routes — GET /sweeps, GET /sweeps/candidates, GET /sweeps/batches, POST /sweeps/scan, POST /sweeps/trigger
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import { scanSweepCandidates } from '../services/sweep-candidate-scan.service.js';
import { ConflictError, NotFoundError, createSweeps } from '../services/sweep-create.service.js';
import type { SweepExecuteJobData } from '../services/sweep-create.service.js';

const SweepSchema = z.object({
  id: z.string().uuid(),
  userAddressId: z.string().uuid().nullable(),
  chain: z.enum(['bnb', 'sol']),
  token: z.enum(['USDT', 'USDC']),
  fromAddr: z.string(),
  toMultisig: z.string(),
  amount: z.string(),
  status: z.enum(['pending', 'submitted', 'confirmed', 'failed']),
  txHash: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  broadcastAt: z.string().datetime().nullable(),
  confirmedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const SweepCandidateSchema = z.object({
  userAddressId: z.string().uuid(),
  userId: z.string().uuid(),
  chain: z.enum(['bnb', 'sol']),
  address: z.string(),
  derivationPath: z.string().nullable(),
  creditedUsdt: z.string(),
  creditedUsdc: z.string(),
  estimatedUsd: z.number(),
});

const sweepsRoutes: FastifyPluginAsync<{ sweepQueue: Queue<SweepExecuteJobData> }> = async (
  app,
  opts
) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── GET /sweeps — list sweeps with pagination ─────────────────────────────
  r.get(
    '/sweeps',
    {
      preHandler: requirePerm('sweeps.read'),
      schema: {
        tags: ['sweeps'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          chain: z.enum(['bnb', 'sol']).optional(),
          status: z.enum(['pending', 'submitted', 'confirmed', 'failed']).optional(),
        }),
        response: {
          200: z.object({
            data: z.array(SweepSchema),
            total: z.number().int(),
            page: z.number().int(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { page, limit } = req.query;
      const rows = await app.db.query.sweeps.findMany({
        limit,
        offset: (page - 1) * limit,
        orderBy: (sweeps, { desc }) => [desc(sweeps.createdAt)],
      });

      const mapped = rows.map((s) => ({
        ...s,
        userAddressId: s.userAddressId ?? null,
        createdBy: s.createdBy ?? null,
        txHash: s.txHash ?? null,
        broadcastAt: s.broadcastAt?.toISOString() ?? null,
        confirmedAt: s.confirmedAt?.toISOString() ?? null,
        errorMessage: s.errorMessage ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }));

      return reply.code(200).send({ data: mapped, total: rows.length, page });
    }
  );

  // ── GET /sweeps/candidates — list addressable sweep candidates ────────────
  r.get(
    '/sweeps/candidates',
    {
      preHandler: requirePerm('sweeps.read'),
      schema: {
        tags: ['sweeps'],
        querystring: z.object({
          chain: z.enum(['bnb', 'sol']).optional(),
          token: z.enum(['USDT', 'USDC']).optional(),
          min_amount: z.coerce.number().positive().optional(),
        }),
        response: {
          200: z.object({ data: z.array(SweepCandidateSchema), total: z.number().int() }),
        },
      },
    },
    async (req, reply) => {
      const { chain, token, min_amount } = req.query;
      const candidates = await scanSweepCandidates(app.db, chain, token, min_amount);
      return reply.code(200).send({ data: candidates, total: candidates.length });
    }
  );

  // ── POST /sweeps/scan — trigger candidate refresh (returns live list) ─────
  r.post(
    '/sweeps/scan',
    {
      preHandler: requirePerm('sweeps.read'),
      schema: {
        tags: ['sweeps'],
        body: z.object({
          chain: z.enum(['bnb', 'sol']).optional(),
          token: z.enum(['USDT', 'USDC']).optional(),
        }),
        response: {
          200: z.object({ data: z.array(SweepCandidateSchema), total: z.number().int() }),
        },
      },
    },
    async (req, reply) => {
      const { chain, token } = req.body;
      const candidates = await scanSweepCandidates(app.db, chain, token);
      return reply.code(200).send({ data: candidates, total: candidates.length });
    }
  );

  // ── POST /sweeps/trigger — enqueue sweep jobs for selected candidates ─────
  r.post(
    '/sweeps/trigger',
    {
      preHandler: requirePerm('sweeps.trigger'),
      schema: {
        tags: ['sweeps'],
        body: z.object({
          candidate_ids: z.array(z.string().uuid()).min(1).max(50),
        }),
        response: {
          200: z.object({
            created: z.array(
              z.object({ sweepId: z.string(), userAddressId: z.string(), jobId: z.string() })
            ),
            skipped: z.array(z.object({ userAddressId: z.string(), reason: z.string() })),
          }),
          404: z.object({ code: z.string(), message: z.string() }),
          409: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staff = req.session.staff ?? { id: '' };
      try {
        const result = await createSweeps(
          app.db,
          req.body.candidate_ids,
          staff.id,
          opts.sweepQueue,
          app.io
        );
        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        if (err instanceof ConflictError) {
          return reply.code(409).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );
  // ── GET /sweeps/batches — aggregate sweeps into pseudo-batches ───────────
  // No physical batch table exists; we group confirmed/submitted sweeps that
  // were created within the same 60-second window + chain as a "batch".
  // The UI uses this for the Recent batches history widget (SweepBatchHistory).
  r.get(
    '/sweeps/batches',
    {
      preHandler: requirePerm('sweeps.read'),
      schema: {
        tags: ['sweeps'],
        querystring: z.object({
          chain: z.enum(['bnb', 'sol']).optional(),
          limit: z.coerce.number().int().positive().max(50).default(10),
        }),
        response: {
          200: z.object({
            data: z.array(
              z.object({
                id: z.string(),
                chain: z.enum(['bnb', 'sol']),
                addresses: z.number().int(),
                total: z.number(),
                fee: z.number(),
                status: z.enum(['completed', 'partial', 'pending', 'failed']),
                createdAt: z.string().datetime(),
                executedAt: z.string().datetime().nullable(),
              })
            ),
          }),
        },
      },
    },
    async (req, reply) => {
      const { chain, limit } = req.query;

      // Fetch recent sweeps (look back 30 days, up to limit * 20 rows to form batches)
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
      const conditions = [gte(schema.sweeps.createdAt, since)];
      if (chain) conditions.push(eq(schema.sweeps.chain, chain));

      const rows = await app.db.query.sweeps.findMany({
        where: and(...conditions),
        orderBy: [desc(schema.sweeps.createdAt)],
        limit: limit * 20,
      });

      // Group rows into 60-second windows per chain+createdBy key.
      // Each window becomes one "batch" entry.
      const batches: Array<{
        id: string;
        chain: 'bnb' | 'sol';
        addresses: number;
        total: number;
        fee: number;
        status: 'completed' | 'partial' | 'pending' | 'failed';
        createdAt: string;
        executedAt: string | null;
      }> = [];

      const windows = new Map<string, { sweeps: typeof rows; key: string; windowStart: Date }>();

      for (const sweep of rows) {
        // Window key: chain + createdBy + 60s bucket
        const bucket = Math.floor(sweep.createdAt.getTime() / 60_000);
        const key = `${sweep.chain}:${sweep.createdBy ?? 'system'}:${bucket}`;
        if (!windows.has(key)) {
          windows.set(key, { sweeps: [], key, windowStart: sweep.createdAt });
        }
        windows.get(key)?.sweeps.push(sweep);
      }

      for (const { sweeps: group, windowStart } of windows.values()) {
        const totalAmt = group.reduce((acc, s) => acc + Number.parseFloat(s.amount), 0);
        const statuses = new Set(group.map((s) => s.status));
        const executedAt =
          group
            .map((s) => s.confirmedAt)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null;

        let batchStatus: 'completed' | 'partial' | 'pending' | 'failed';
        if (statuses.has('failed') && statuses.size > 1) batchStatus = 'partial';
        else if (statuses.has('failed')) batchStatus = 'failed';
        else if (statuses.has('pending') || statuses.has('submitted')) batchStatus = 'pending';
        else batchStatus = 'completed';

        const first = group[0];
        if (!first) continue; // group is always non-empty but required by exactOptionalPropertyTypes
        batches.push({
          id: first.id,
          chain: first.chain,
          addresses: group.length,
          total: totalAmt,
          fee: 0, // fee data not stored per-sweep; UI shows 0 gracefully
          status: batchStatus,
          createdAt: windowStart.toISOString(),
          executedAt: executedAt?.toISOString() ?? null,
        });

        if (batches.length >= limit) break;
      }

      return reply.code(200).send({ data: batches });
    }
  );
};

export default sweepsRoutes;
