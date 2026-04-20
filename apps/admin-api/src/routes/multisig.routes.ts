// Multisig routes — GET /multisig-ops, POST /multisig-ops/:id/submit-signature (stubs)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import { MultisigOp } from '@wp/shared-types';

const NOT_IMPL = z.object({ code: z.string(), message: z.string() });

const multisigRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/multisig-ops',
    {
      preHandler: requirePerm('multisig.read'),
      schema: {
        tags: ['multisig'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          status: z.enum(['pending','collecting','ready','submitted','confirmed','expired','failed']).optional(),
        }),
        response: { 200: z.object({ data: z.array(MultisigOp), total: z.number().int(), page: z.number().int() }) },
      },
    },
    async (_req, reply) => reply.code(200).send({ data: [], total: 0, page: 1 }),
  );

  r.post(
    '/multisig-ops/:id/submit-signature',
    {
      preHandler: requirePerm('multisig.sign'),
      schema: {
        tags: ['multisig'],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ signature: z.string().min(1), signerAddress: z.string().min(1) }),
        response: { 501: NOT_IMPL },
      },
    },
    async (_req, reply) => reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Wired in P09' }),
  );
};

export default multisigRoutes;
