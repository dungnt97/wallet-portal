// Staff routes — GET /staff, POST /staff/signing-keys (stubs)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import { StaffMember, StaffSigningKey } from '@wp/shared-types';

const NOT_IMPL = z.object({ code: z.string(), message: z.string() });

const staffRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/staff',
    {
      preHandler: requirePerm('staff.read'),
      schema: {
        tags: ['staff'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
        }),
        response: { 200: z.object({ data: z.array(StaffMember), total: z.number().int(), page: z.number().int() }) },
      },
    },
    async (_req, reply) => reply.code(200).send({ data: [], total: 0, page: 1 }),
  );

  r.post(
    '/staff/signing-keys',
    {
      preHandler: requirePerm('staff.manage'),
      schema: {
        tags: ['staff'],
        body: z.object({
          staffId: z.string().uuid(),
          chain: z.enum(['bnb', 'sol']),
          address: z.string().min(1),
          tier: z.enum(['hot', 'cold']),
          walletType: z.enum(['metamask', 'phantom', 'ledger', 'other']),
          hwAttested: z.boolean().default(false),
        }),
        response: { 200: StaffSigningKey, 501: NOT_IMPL },
      },
    },
    async (_req, reply) => reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Wired in P09' }),
  );
};

export default staffRoutes;
