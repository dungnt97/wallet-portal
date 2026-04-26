import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Tests for routes/auth.routes.ts — verifies that authRoutes composes
// oidcRoutes + webauthnRoutes under the same Fastify instance.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/google-oidc-client.js', () => ({
  buildAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/auth'),
  buildAuthUrlWithDomain: vi.fn().mockReturnValue('https://accounts.google.com/auth?hd=corp'),
  exchangeCodeForIdToken: vi.fn().mockResolvedValue('id-token'),
  verifyIdToken: vi.fn().mockResolvedValue({
    sub: 's',
    email: 'e@corp.com',
    email_verified: true,
    name: 'N',
  }),
  isAllowedWorkspaceDomain: vi.fn().mockReturnValue(true),
}));

vi.mock('../auth/webauthn-server.js', () => ({
  buildRegistrationOptions: vi.fn().mockResolvedValue({
    challenge: 'c',
    rp: {},
    user: {},
    pubKeyCredParams: [],
    excludeCredentials: [],
  }),
  confirmRegistration: vi.fn().mockResolvedValue({
    verified: true,
    registrationInfo: { credentialID: 'id', credentialPublicKey: new Uint8Array(), counter: 0 },
  }),
  buildAuthenticationOptions: vi.fn().mockResolvedValue({
    challenge: 'ac',
    rpId: 'localhost',
    allowCredentials: [],
    timeout: 60000,
    userVerification: 'preferred',
  }),
  confirmAuthentication: vi
    .fn()
    .mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } }),
}));

vi.mock('../auth/rbac.middleware.js', () => ({
  requireAuth: vi.fn().mockReturnValue([]),
}));

vi.mock('../services/login-history.service.js', () => ({
  recordLogin: vi.fn(),
}));

describe('auth.routes.ts — composition', () => {
  it('registers both /auth/session/initiate (OIDC) and /auth/webauthn/challenge (WebAuthn)', async () => {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // where() must resolve directly (no .limit() in some routes) — return a real Promise with a .limit stub
    const makeWhere = (rows: unknown[]) => {
      const p = Promise.resolve(rows) as Promise<unknown[]> & { limit: ReturnType<typeof vi.fn> };
      p.limit = vi.fn().mockResolvedValue(rows);
      return p;
    };
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(makeWhere([])),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ catch: vi.fn() }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    };
    app.decorate('db', mockDb as never);

    app.addHook('preHandler', async (req) => {
      req.session = {
        staff: { id: 'staff-001', email: 's@corp.com', role: 'admin' },
        oauthState: { state: 'st', verifier: 'v' },
        webauthnChallenge: 'challenge-xyz',
        webauthnChallengeExpiresAt: Date.now() + 60_000,
        regenerate: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
      } as unknown as typeof req.session;
    });

    const { default: authRoutes } = await import('../routes/auth.routes.js');
    await app.register(authRoutes, {
      cfg: {
        GOOGLE_CLIENT_ID: 'cid',
        GOOGLE_CLIENT_SECRET: 'cs',
        GOOGLE_REDIRECT_URI: 'https://app.test/cb',
        GOOGLE_WORKSPACE_DOMAIN: 'corp.com',
        CORS_ORIGIN: 'https://app.test',
        AUTH_DEV_MODE: 'false',
        WEBAUTHN_RP_ID: 'localhost',
        WEBAUTHN_RP_NAME: 'Test',
        WEBAUTHN_ORIGIN: 'https://localhost',
        DATABASE_URL: '',
        REDIS_URL: '',
        SESSION_SECRET: '',
        INTERNAL_BEARER_TOKEN: '',
        NODE_ENV: 'test',
        PORT: 3000,
      } as never,
    });
    await app.ready();

    // OIDC route registered
    const oidcRes = await app.inject({ method: 'POST', url: '/auth/session/initiate' });
    if (oidcRes.statusCode !== 200) console.log('initiate body:', oidcRes.body);
    expect(oidcRes.statusCode).toBe(200);

    // WebAuthn route registered
    const waRes = await app.inject({ method: 'POST', url: '/auth/webauthn/challenge' });
    expect(waRes.statusCode).toBe(200);

    await app.close();
  });
});
