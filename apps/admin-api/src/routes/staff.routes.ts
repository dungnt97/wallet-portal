import { StaffMember, StaffSigningKey } from '@wp/shared-types';
// Staff routes — GET /staff, POST /staff/signing-keys, GET /staff/me/sessions, GET /staff/:id/sessions
import { count, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, requirePerm } from '../auth/rbac.middleware.js';
import { staffLoginHistory } from '../db/schema/index.js';

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
        response: {
          200: z.object({
            data: z.array(StaffMember),
            total: z.number().int(),
            page: z.number().int(),
          }),
        },
      },
    },
    async (_req, reply) => reply.code(200).send({ data: [], total: 0, page: 1 })
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
    async (_req, reply) =>
      reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Wired in P09' })
  );

  // Session row schema for list responses
  const SessionRow = z.object({
    id: z.string().uuid(),
    success: z.boolean(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
    failureReason: z.string().nullable(),
    createdAt: z.string().datetime(),
  });

  const SessionsQuery = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  });

  // GET /staff/me/sessions — own login history (any authenticated staff)
  r.get(
    '/staff/me/sessions',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['staff'],
        querystring: SessionsQuery,
        response: {
          200: z.object({
            data: z.array(SessionRow),
            total: z.number().int(),
            page: z.number().int(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { page, limit } = req.query as { page: number; limit: number };
      // requireAuth() guarantees staff is set — safe to assert
      // biome-ignore lint/style/noNonNullAssertion: requireAuth preHandler ensures session.staff exists
      const staffId = req.session.staff!.id;
      const offset = (page - 1) * limit;

      const rows = await app.db
        .select()
        .from(staffLoginHistory)
        .where(eq(staffLoginHistory.staffId, staffId))
        .orderBy(desc(staffLoginHistory.createdAt))
        .limit(limit)
        .offset(offset);

      // Total count — separate query for simplicity; history table is append-only
      const countRows = await app.db
        .select({ value: count() })
        .from(staffLoginHistory)
        .where(eq(staffLoginHistory.staffId, staffId));
      const total = Number(countRows[0]?.value ?? 0);

      return reply.code(200).send({
        data: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
        page,
      });
    }
  );

  // GET /staff/:id/sessions — view any staff member's login history (admin only)
  r.get(
    '/staff/:id/sessions',
    {
      preHandler: requirePerm('staff.read'),
      schema: {
        tags: ['staff'],
        params: z.object({ id: z.string().uuid() }),
        querystring: SessionsQuery,
        response: {
          200: z.object({
            data: z.array(SessionRow),
            total: z.number().int(),
            page: z.number().int(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { page, limit } = req.query as { page: number; limit: number };
      const offset = (page - 1) * limit;

      const rows = await app.db
        .select()
        .from(staffLoginHistory)
        .where(eq(staffLoginHistory.staffId, id))
        .orderBy(desc(staffLoginHistory.createdAt))
        .limit(limit)
        .offset(offset);

      const countRowsById = await app.db
        .select({ value: count() })
        .from(staffLoginHistory)
        .where(eq(staffLoginHistory.staffId, id));
      const totalById = Number(countRowsById[0]?.value ?? 0);

      return reply.code(200).send({
        data: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        total: totalById,
        page,
      });
    }
  );
};

export default staffRoutes;
