// Audit log routes — GET /audit-log (paginated, filterable stub)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import { AuditEvent } from '@wp/shared-types';

const auditRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/audit-log',
    {
      preHandler: requirePerm('audit.read'),
      schema: {
        tags: ['audit'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(50),
          staffId: z.string().uuid().optional(),
          resourceType: z.string().optional(),
          resourceId: z.string().optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        }),
        response: {
          200: z.object({
            data: z.array(AuditEvent),
            total: z.number().int(),
            page: z.number().int(),
          }),
        },
      },
    },
    async (_req, reply) => reply.code(200).send({ data: [], total: 0, page: 1 }),
  );
};

export default auditRoutes;
