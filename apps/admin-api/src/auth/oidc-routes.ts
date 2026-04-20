// OIDC route handlers — Google Workspace OAuth2 / PKCE flow
// POST /auth/session/initiate  → returns { url } for frontend redirect
// GET  /auth/session/callback  → exchanges code, verifies id_token, sets session
// POST /auth/session/logout    → destroys session
// GET  /auth/me                → returns current session staff
import { randomBytes, createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  buildAuthUrlWithDomain,
  exchangeCodeForIdToken,
  verifyIdToken,
  isAllowedWorkspaceDomain,
} from './google-oidc-client.js';
import { staffMembers } from '../db/schema/index.js';
import { requireAuth } from './rbac.middleware.js';
import type { Config } from '../config/env.js';

const StaffOut = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['admin', 'treasurer', 'operator', 'viewer']),
});

export const oidcRoutes: FastifyPluginAsync<{ cfg: Config }> = async (app, opts) => {
  const { cfg } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();

  const oidcCfg = {
    clientId: cfg.GOOGLE_CLIENT_ID,
    clientSecret: cfg.GOOGLE_CLIENT_SECRET,
    redirectUri: cfg.GOOGLE_REDIRECT_URI,
  };

  // POST /auth/session/initiate — generate PKCE pair, store in session, return auth URL
  r.post(
    '/auth/session/initiate',
    {
      schema: {
        tags: ['auth'],
        response: {
          200: z.object({ url: z.string().url() }),
        },
      },
    },
    async (req, reply) => {
      const state = randomBytes(16).toString('hex');
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');

      req.session.oauthState = { state, verifier };

      const url = buildAuthUrlWithDomain(oidcCfg, state, challenge, cfg.GOOGLE_WORKSPACE_DOMAIN);
      return reply.code(200).send({ url });
    },
  );

  // GET /auth/session/callback — exchange code, verify id_token, upsert staff, set session
  r.get(
    '/auth/session/callback',
    {
      schema: {
        tags: ['auth'],
        querystring: z.object({
          code: z.string(),
          state: z.string(),
        }),
      },
    },
    async (req, reply) => {
      const { code, state } = req.query as { code: string; state: string };
      const saved = req.session.oauthState;

      // CSRF state check
      if (!saved || saved.state !== state) {
        return reply.code(400).send({ code: 'INVALID_STATE', message: 'OAuth state mismatch' });
      }

      const { verifier } = saved;
      // Clear oauth state immediately — one-time use
      // Double cast needed: FastifySessionObject lacks index signature
      delete (req.session as unknown as Record<string, unknown>)['oauthState'];

      let idPayload;
      try {
        const idToken = await exchangeCodeForIdToken(oidcCfg, code, verifier);
        idPayload = await verifyIdToken(idToken, cfg.GOOGLE_CLIENT_ID);
      } catch (err) {
        app.log.warn({ err }, 'OIDC token verification failed');
        return reply.code(401).send({ code: 'TOKEN_INVALID', message: 'ID token verification failed' });
      }

      // D3 — enforce workspace domain if env is set (never hardcoded)
      if (!isAllowedWorkspaceDomain(idPayload, cfg.GOOGLE_WORKSPACE_DOMAIN)) {
        app.log.warn({ email: idPayload.email, hd: idPayload.hd }, 'Login rejected: workspace domain mismatch');
        return reply.code(403).send({ code: 'DOMAIN_NOT_ALLOWED', message: 'Account domain not permitted' });
      }

      // Staff must exist and be active — no self-provisioning
      const rows = await app.db
        .select({
          id: staffMembers.id,
          email: staffMembers.email,
          name: staffMembers.name,
          role: staffMembers.role,
          status: staffMembers.status,
        })
        .from(staffMembers)
        .where(eq(staffMembers.email, idPayload.email))
        .limit(1);

      const staff = rows[0];
      if (!staff || staff.status !== 'active') {
        return reply.code(403).send({ code: 'UNAUTHORIZED_STAFF', message: 'Staff not found or inactive' });
      }

      // Update last_login_at — fire-and-forget, non-blocking
      app.db
        .update(staffMembers)
        .set({ lastLoginAt: new Date() })
        .where(eq(staffMembers.id, staff.id))
        .catch((err) => app.log.error({ err }, 'Failed to update last_login_at'));

      // Regenerate session ID to prevent fixation attacks
      await req.session.regenerate();

      req.session.staff = {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
      };

      return reply.redirect(`${cfg.CORS_ORIGIN}/auth/callback?ok=1`);
    },
  );

  // GET /auth/me — return current session staff (401 if not logged in)
  r.get(
    '/auth/me',
    {
      schema: {
        tags: ['auth'],
        response: {
          200: StaffOut,
          401: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      if (!req.session.staff) {
        return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Login required' });
      }
      return reply.code(200).send(req.session.staff);
    },
  );

  // POST /auth/session/logout — destroy session
  r.post(
    '/auth/session/logout',
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
};
