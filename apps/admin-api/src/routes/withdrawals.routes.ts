// Withdrawals routes — CRUD stubs (business logic wired in P09)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import { Withdrawal } from '@wp/shared-types';

const NOT_IMPL = z.object({ code: z.string(), message: z.string() });

const withdrawalsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/withdrawals',
    {
      preHandler: requirePerm('withdrawals.read'),
      schema: {
        tags: ['withdrawals'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          status: z.enum(['pending','approved','time_locked','executing','completed','cancelled','failed']).optional(),
        }),
        response: { 200: z.object({ data: z.array(Withdrawal), total: z.number().int(), page: z.number().int() }) },
      },
    },
    async (_req, reply) => reply.code(200).send({ data: [], total: 0, page: 1 }),
  );

  r.post(
    '/withdrawals',
    {
      preHandler: requirePerm('withdrawals.create'),
      schema: {
        tags: ['withdrawals'],
        body: z.object({
          userId: z.string().uuid(),
          chain: z.enum(['bnb', 'sol']),
          token: z.enum(['USDT', 'USDC']),
          amount: z.string().regex(/^\d+(\.\d+)?$/),
          destinationAddr: z.string().min(1),
          sourceTier: z.enum(['hot', 'cold']),
        }),
        response: { 501: NOT_IMPL },
      },
    },
    async (_req, reply) => reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Wired in P09' }),
  );

  r.post(
    '/withdrawals/:id/approve',
    {
      preHandler: requirePerm('withdrawals.approve'),
      schema: {
        tags: ['withdrawals'],
        params: z.object({ id: z.string().uuid() }),
        response: { 501: NOT_IMPL },
      },
    },
    async (_req, reply) => reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Wired in P09' }),
  );

  r.post(
    '/withdrawals/:id/execute',
    {
      preHandler: requirePerm('withdrawals.execute'),
      schema: {
        tags: ['withdrawals'],
        params: z.object({ id: z.string().uuid() }),
        response: { 501: NOT_IMPL },
      },
    },
    async (_req, reply) => reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Wired in P09' }),
  );

  r.post(
    '/withdrawals/:id/cancel',
    {
      preHandler: requirePerm('withdrawals.cancel'),
      schema: {
        tags: ['withdrawals'],
        params: z.object({ id: z.string().uuid() }),
        response: { 501: NOT_IMPL },
      },
    },
    async (_req, reply) => reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Wired in P09' }),
  );
};

export default withdrawalsRoutes;
