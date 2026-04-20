// Auth routes — session login stub + WebAuthn stubs (real OIDC in P06)
// POST /auth/session  — email → staff lookup → set session cookie
// GET  /auth/me       — return current session staff (fixture for P04)
// POST /auth/webauthn/challenge — stub 501
// POST /auth/webauthn/verify   — stub 501
// DELETE /auth/session         — logout
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { lookupStaffByEmail } from '../auth/session.stub.js';
import { requireAuth } from '../auth/rbac.middleware.js';

// Fixture staff for /auth/me when no DB available (test/dev without seed)
const FIXTURE_STAFF = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'alice@company.com',
  name: 'Alice Chen',
  role: 'admin' as const,
};

const StaffSessionSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['admin', 'treasurer', 'operator', 'viewer']),
});

const authRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // POST /auth/session — stub login: email → session
  r.post(
    '/auth/session',
    {
      schema: {
        tags: ['auth'],
        body: z.object({ email: z.string().email() }),
        response: {
          200: StaffSessionSchema,
          401: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staff = await lookupStaffByEmail(app.db, req.body.email);
      if (!staff) {
        return reply.code(401).send({ code: 'INVALID_CREDENTIALS', message: 'Staff not found or inactive' });
      }
      req.session.staff = staff;
      return reply.code(200).send(staff);
    },
  );

  // GET /auth/me — return current session staff
  r.get(
    '/auth/me',
    {
      schema: {
        tags: ['auth'],
        response: { 200: StaffSessionSchema },
      },
    },
    async (req, reply) => {
      // Return session staff if present, else fixture (dev convenience)
      const staff = req.session.staff ?? FIXTURE_STAFF;
      return reply.code(200).send(staff);
    },
  );

  // DELETE /auth/session — logout
  r.delete(
    '/auth/session',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['auth'],
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (req, reply) => {
      await req.session.destroy();
      return reply.code(200).send({ ok: true });
    },
  );

  // POST /auth/webauthn/challenge — stub (P06)
  r.post(
    '/auth/webauthn/challenge',
    {
      schema: {
        tags: ['auth'],
        response: { 501: z.object({ code: z.string(), message: z.string() }) },
      },
    },
    async (_req, reply) => {
      return reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'WebAuthn implemented in P06' });
    },
  );

  // POST /auth/webauthn/verify — stub (P06)
  r.post(
    '/auth/webauthn/verify',
    {
      schema: {
        tags: ['auth'],
        response: { 501: z.object({ code: z.string(), message: z.string() }) },
      },
    },
    async (_req, reply) => {
      return reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'WebAuthn implemented in P06' });
    },
  );
};

export default authRoutes;
