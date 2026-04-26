import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Tests for auth/oidc-routes.ts
// POST /auth/session/initiate
// GET  /auth/session/callback
// GET  /auth/me
// POST /auth/session/logout
// POST /auth/session/dev-login
// POST /auth/session/heartbeat
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock OIDC helpers ─────────────────────────────────────────────────────────

const mockBuildAuthUrlWithDomain = vi
  .fn()
  .mockReturnValue('https://accounts.google.com/auth?foo=1');
const mockExchangeCodeForIdToken = vi.fn().mockResolvedValue('id-token-xyz');
const mockVerifyIdToken = vi.fn().mockResolvedValue({
  sub: 'google-sub-001',
  email: 'admin@corp.com',
  email_verified: true,
  name: 'Admin User',
  hd: 'corp.com',
});
const mockIsAllowedWorkspaceDomain = vi.fn().mockReturnValue(true);

vi.mock('../auth/google-oidc-client.js', () => ({
  buildAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/auth'),
  buildAuthUrlWithDomain: (...args: unknown[]) => mockBuildAuthUrlWithDomain(...args),
  exchangeCodeForIdToken: (...args: unknown[]) => mockExchangeCodeForIdToken(...args),
  verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args),
  isAllowedWorkspaceDomain: (...args: unknown[]) => mockIsAllowedWorkspaceDomain(...args),
}));

vi.mock('../auth/rbac.middleware.js', () => ({
  requireAuth: vi.fn().mockReturnValue([]),
}));

vi.mock('../services/login-history.service.js', () => ({
  recordLogin: vi.fn().mockResolvedValue(undefined),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const STAFF_ROW = {
  id: STAFF_ID,
  email: 'admin@corp.com',
  name: 'Admin User',
  role: 'admin' as const,
  status: 'active',
};

const BASE_CFG = {
  GOOGLE_CLIENT_ID: 'client-id-test',
  GOOGLE_CLIENT_SECRET: 'secret-test',
  GOOGLE_REDIRECT_URI: 'https://app.test/auth/callback',
  GOOGLE_WORKSPACE_DOMAIN: 'corp.com',
  CORS_ORIGIN: 'https://app.test',
  AUTH_DEV_MODE: 'false',
  DATABASE_URL: '',
  REDIS_URL: '',
  SESSION_SECRET: '',
  INTERNAL_BEARER_TOKEN: '',
  NODE_ENV: 'test',
  PORT: 3000,
};

// ── App builder ───────────────────────────────────────────────────────────────

async function buildApp(opts: {
  staffRow?: typeof STAFF_ROW | null;
  sessionOverrides?: Record<string, unknown>;
  cfgOverrides?: Partial<typeof BASE_CFG>;
}) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const staffRows = opts.staffRow !== null ? [opts.staffRow ?? STAFF_ROW] : [];

  const mockDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(staffRows),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
        catch: vi.fn(),
      }),
    }),
  };

  app.decorate('db', mockDb as never);

  // Session mock — supports regenerate() and destroy()
  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: null,
      oauthState: { state: 'valid-state-001', verifier: 'pkce-verifier-001' },
      regenerate: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      ...opts.sessionOverrides,
    } as unknown as typeof req.session;
  });

  const { oidcRoutes } = await import('../auth/oidc-routes.js');
  await app.register(oidcRoutes, {
    cfg: { ...BASE_CFG, ...opts.cfgOverrides } as never,
  });
  await app.ready();
  return { app, mockDb };
}

// ── POST /auth/session/initiate ────────────────────────────────────────────────

describe('POST /auth/session/initiate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAuthUrlWithDomain.mockReturnValue('https://accounts.google.com/auth?foo=1');
  });

  it('returns 200 with Google auth URL', async () => {
    const { app } = await buildApp({});
    const res = await app.inject({ method: 'POST', url: '/auth/session/initiate' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.url).toBe('https://accounts.google.com/auth?foo=1');
  });

  it('calls buildAuthUrlWithDomain with workspace domain', async () => {
    const { app } = await buildApp({});
    await app.inject({ method: 'POST', url: '/auth/session/initiate' });
    await app.close();

    expect(mockBuildAuthUrlWithDomain).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'client-id-test' }),
      expect.any(String), // state
      expect.any(String), // challenge
      'corp.com'
    );
  });
});

// ── GET /auth/session/callback ────────────────────────────────────────────────

describe('GET /auth/session/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCodeForIdToken.mockResolvedValue('id-token-xyz');
    mockVerifyIdToken.mockResolvedValue({
      sub: 'google-sub-001',
      email: 'admin@corp.com',
      email_verified: true,
      name: 'Admin User',
      hd: 'corp.com',
    });
    mockIsAllowedWorkspaceDomain.mockReturnValue(true);
  });

  it('redirects to CORS_ORIGIN/auth/callback?ok=1 on success', async () => {
    const { app } = await buildApp({ staffRow: STAFF_ROW });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/session/callback?code=auth-code-001&state=valid-state-001',
    });
    await app.close();

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://app.test/auth/callback?ok=1');
  });

  it('returns 400 INVALID_STATE when state does not match', async () => {
    const { app } = await buildApp({
      sessionOverrides: { oauthState: { state: 'different-state', verifier: 'v' } },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/session/callback?code=auth-code-001&state=wrong-state',
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('INVALID_STATE');
  });

  it('returns 400 INVALID_STATE when no oauthState in session', async () => {
    const { app } = await buildApp({ sessionOverrides: { oauthState: undefined } });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/session/callback?code=auth-code-001&state=valid-state-001',
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('INVALID_STATE');
  });

  it('returns 401 TOKEN_INVALID when exchangeCodeForIdToken throws', async () => {
    mockExchangeCodeForIdToken.mockRejectedValueOnce(new Error('exchange failed'));

    const { app } = await buildApp({});
    const res = await app.inject({
      method: 'GET',
      url: '/auth/session/callback?code=bad-code&state=valid-state-001',
    });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('TOKEN_INVALID');
  });

  it('returns 403 DOMAIN_NOT_ALLOWED when workspace domain mismatch', async () => {
    mockIsAllowedWorkspaceDomain.mockReturnValueOnce(false);

    const { app } = await buildApp({});
    const res = await app.inject({
      method: 'GET',
      url: '/auth/session/callback?code=auth-code&state=valid-state-001',
    });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('DOMAIN_NOT_ALLOWED');
  });

  it('returns 403 UNAUTHORIZED_STAFF when staff not found in DB', async () => {
    const { app } = await buildApp({ staffRow: null });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/session/callback?code=auth-code&state=valid-state-001',
    });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('UNAUTHORIZED_STAFF');
  });

  it('returns 403 UNAUTHORIZED_STAFF when staff is inactive', async () => {
    const { app } = await buildApp({ staffRow: { ...STAFF_ROW, status: 'suspended' } });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/session/callback?code=auth-code&state=valid-state-001',
    });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('UNAUTHORIZED_STAFF');
  });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────

describe('GET /auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with staff when session is active', async () => {
    const { app } = await buildApp({
      sessionOverrides: { staff: STAFF_ROW },
    });
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(STAFF_ID);
    expect(body.email).toBe('admin@corp.com');
  });

  it('returns 401 UNAUTHENTICATED when no session staff', async () => {
    const { app } = await buildApp({ sessionOverrides: { staff: null } });
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('UNAUTHENTICATED');
  });
});

// ── POST /auth/session/logout ─────────────────────────────────────────────────

describe('POST /auth/session/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('destroys session and returns ok=true', async () => {
    const destroyFn = vi.fn().mockResolvedValue(undefined);
    const { app } = await buildApp({ sessionOverrides: { destroy: destroyFn } });
    const res = await app.inject({ method: 'POST', url: '/auth/session/logout' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(destroyFn).toHaveBeenCalled();
  });
});

// ── POST /auth/session/dev-login ──────────────────────────────────────────────

describe('POST /auth/session/dev-login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 DEV_MODE_DISABLED when AUTH_DEV_MODE is false', async () => {
    const { app } = await buildApp({ cfgOverrides: { AUTH_DEV_MODE: 'false' } });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/session/dev-login',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'admin@corp.com' },
    });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('DEV_MODE_DISABLED');
  });

  it('returns staff on success when AUTH_DEV_MODE=true', async () => {
    const { app } = await buildApp({
      cfgOverrides: { AUTH_DEV_MODE: 'true' },
      staffRow: STAFF_ROW,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/session/dev-login',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'admin@corp.com' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(STAFF_ID);
  });

  it('returns 404 STAFF_NOT_FOUND when email not in DB', async () => {
    const { app } = await buildApp({
      cfgOverrides: { AUTH_DEV_MODE: 'true' },
      staffRow: null,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/session/dev-login',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'nobody@corp.com' },
    });
    await app.close();

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('STAFF_NOT_FOUND');
  });
});

// ── POST /auth/session/heartbeat ──────────────────────────────────────────────

describe('POST /auth/session/heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 204 when staff session is active', async () => {
    const { app } = await buildApp({ sessionOverrides: { staff: STAFF_ROW } });
    const res = await app.inject({ method: 'POST', url: '/auth/session/heartbeat' });
    await app.close();

    expect(res.statusCode).toBe(204);
  });

  it('returns 401 when no session staff', async () => {
    const { app } = await buildApp({ sessionOverrides: { staff: null } });
    const res = await app.inject({ method: 'POST', url: '/auth/session/heartbeat' });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('UNAUTHENTICATED');
  });
});
