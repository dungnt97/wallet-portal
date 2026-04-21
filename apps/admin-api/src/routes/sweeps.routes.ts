import type { Queue } from 'bullmq';
// Sweeps routes — GET /sweeps, GET /sweeps/candidates, POST /sweeps/scan, POST /sweeps/trigger
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
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
};

export default sweepsRoutes;
