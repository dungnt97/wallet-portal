// Users routes — GET /users, POST /users, POST /users/:id/addresses (stubs)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import { UserRecord, UserAddress } from '@wp/shared-types';

const NOT_IMPL = z.object({ code: z.string(), message: z.string() });

const usersRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/users',
    {
      preHandler: requirePerm('users.read'),
      schema: {
        tags: ['users'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          status: z.enum(['active', 'suspended', 'closed']).optional(),
        }),
        response: { 200: z.object({ data: z.array(UserRecord), total: z.number().int(), page: z.number().int() }) },
      },
    },
    async (_req, reply) => reply.code(200).send({ data: [], total: 0, page: 1 }),
  );

  r.post(
    '/users',
    {
      preHandler: requirePerm('users.manage'),
      schema: {
        tags: ['users'],
        body: z.object({ email: z.string().email() }),
        response: { 501: NOT_IMPL },
      },
    },
    async (_req, reply) => reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Wired in P09' }),
  );

  r.post(
    '/users/:id/addresses',
    {
      preHandler: requirePerm('users.manage'),
      schema: {
        tags: ['users'],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ chain: z.enum(['bnb', 'sol']) }),
        response: { 200: UserAddress, 501: NOT_IMPL },
      },
    },
    async (_req, reply) => reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Wired in P09' }),
  );
};

export default usersRoutes;
