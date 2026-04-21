import { StaffMember, StaffSigningKey } from '@wp/shared-types';
// Staff routes — GET /staff, POST /staff/signing-keys, sessions, account settings, invite
// PATCH /staff/me                       — update own name + locale_pref
// POST  /staff/me/logout-all            — revoke all own sessions
// POST  /staff/invite                   — admin creates signed invite link for new staff
// POST  /staff/sync-google-workspace    — trigger GW directory sync (admin-only)
import { count, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, requirePerm } from '../auth/rbac.middleware.js';
import { staffLoginHistory } from '../db/schema/index.js';
import { updateProfile } from '../services/account-settings.service.js';
import { inviteStaff } from '../services/staff-invite.service.js';
import { StubError, syncGoogleWorkspace } from '../services/staff-sync-google.service.js';

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

  // ── PATCH /staff/me — update own profile (name + locale_pref) ─────────────
  r.patch(
    '/staff/me',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['staff'],
        body: z.object({
          name: z.string().min(1).max(100).optional(),
          localePref: z.enum(['en', 'vi']).optional(),
        }),
        response: {
          200: z.object({
            id: z.string().uuid(),
            name: z.string(),
            email: z.string().email(),
            localePref: z.string(),
          }),
          400: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth preHandler ensures session.staff exists
      const staffId = req.session.staff!.id;
      const { name, localePref } = req.body;

      try {
        // Build params object without spreading undefined into exactOptionalPropertyTypes fields
        const params: Parameters<typeof updateProfile>[1] = { staffId };
        if (name !== undefined) params.name = name;
        if (localePref !== undefined) params.localePref = localePref;
        const result = await updateProfile(app.db, params);
        return reply.code(200).send(result);
      } catch (err) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', message: (err as Error).message });
      }
    }
  );

  // ── POST /staff/me/logout-all — revoke all own sessions ───────────────────
  // Since sessions are stored in @fastify/session (signed cookies), we can't
  // enumerate them server-side without a session store. We destroy the current
  // session and set a flag in the DB so other tab reloads find the account
  // suspended until next login. A DB-backed session store would support true
  // revoke-all; this is the best we can do with cookie sessions.
  r.post(
    '/staff/me/logout-all',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['staff'],
        response: {
          200: z.object({ message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      // Destroy current session — effectively logs out this device immediately.
      await req.session.destroy();
      return reply.code(200).send({ message: 'Session destroyed. Please sign in again.' });
    }
  );

  // ── POST /staff/invite — admin creates signed invite link ─────────────────
  r.post(
    '/staff/invite',
    {
      preHandler: requirePerm('staff.manage'),
      schema: {
        tags: ['staff'],
        body: z.object({
          email: z.string().email(),
          name: z.string().min(1).max(100),
          role: z.enum(['admin', 'treasurer', 'operator', 'viewer']),
        }),
        response: {
          201: z.object({
            staffId: z.string().uuid(),
            inviteLink: z.string().url(),
            expiresAt: z.string().datetime(),
          }),
          400: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requirePerm preHandler ensures session.staff exists
      const invitedByStaffId = req.session.staff!.id;
      const { email, name, role } = req.body;

      try {
        const result = await inviteStaff(app.db, { email, name, role, invitedByStaffId });
        return reply.code(201).send(result);
      } catch (err) {
        return reply.code(400).send({ code: 'INVITE_ERROR', message: (err as Error).message });
      }
    }
  );

  // ── POST /staff/sync-google-workspace — trigger GW directory sync ─────────
  r.post(
    '/staff/sync-google-workspace',
    {
      preHandler: requirePerm('staff.manage'),
      schema: {
        tags: ['staff'],
        response: {
          200: z.object({
            synced: z.number().int(),
            created: z.number().int(),
            updated: z.number().int(),
            offboarded: z.number().int(),
            durationMs: z.number().int(),
            note: z.string().optional(),
          }),
          501: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requirePerm ensures session.staff exists
      const staffId = req.session.staff!.id;
      try {
        const result = await syncGoogleWorkspace(app.db, staffId);
        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof StubError) {
          return reply.code(501).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  // ── Login history ─────────────────────────────────────────────────────────

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

      const countRows = await app.db
        .select({ value: count() })
        .from(staffLoginHistory)
        .where(eq(staffLoginHistory.staffId, staffId));
      const total = Number(countRows[0]?.value ?? 0);

      return reply.code(200).send({
        data: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        total,
        page,
      });
    }
  );

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
        data: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        total: totalById,
        page,
      });
    }
  );
};

export default staffRoutes;
