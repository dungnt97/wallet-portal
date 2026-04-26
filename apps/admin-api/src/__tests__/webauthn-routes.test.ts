import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Tests for auth/webauthn-routes.ts
// POST /auth/webauthn/register/options
// POST /auth/webauthn/register/verify
// POST /auth/webauthn/challenge
// POST /auth/webauthn/verify
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock webauthn-server helpers ──────────────────────────────────────────────

vi.mock('../auth/webauthn-server.js', () => ({
  buildRegistrationOptions: vi.fn().mockResolvedValue({
    challenge: 'reg-challenge-abc',
    rp: { id: 'localhost', name: 'Test' },
    user: { id: 'dXNlcg==', name: 'user@test.com', displayName: 'Test User' },
    pubKeyCredParams: [],
    excludeCredentials: [],
  }),
  confirmRegistration: vi.fn().mockResolvedValue({
    verified: true,
    registrationInfo: {
      credentialID: 'cred-id-base64',
      credentialPublicKey: new Uint8Array([1, 2, 3]),
      counter: 0,
    },
  }),
  buildAuthenticationOptions: vi.fn().mockResolvedValue({
    challenge: 'auth-challenge-xyz',
    rpId: 'localhost',
    allowCredentials: [],
    timeout: 60000,
    userVerification: 'preferred',
  }),
  confirmAuthentication: vi.fn().mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 1 },
  }),
}));

vi.mock('../auth/rbac.middleware.js', () => ({
  requireAuth: vi.fn().mockReturnValue([]),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const CRED_ID = 'cred-id-stored-001';

const WEBAUTHN_CFG = {
  WEBAUTHN_RP_ID: 'localhost',
  WEBAUTHN_RP_NAME: 'Test Wallet',
  WEBAUTHN_ORIGIN: 'https://localhost:3000',
};

const MOCK_CRED_ROW = {
  credentialId: CRED_ID,
  publicKey: Buffer.from([4, 5, 6]),
  counter: BigInt(0),
  transports: ['internal'],
  deviceName: 'Touch ID',
  staffId: STAFF_ID,
};

// ── App builder ───────────────────────────────────────────────────────────────

// Build a db.select() mock chain that supports both:
//   await db.select().from().where()             (no .limit)
//   await db.select().from().where().limit(n)
function makeSelectChain(rows: unknown[]) {
  const whereResult = {
    limit: vi.fn().mockResolvedValue(rows),
    // Make where() itself a thenable so `await db.select().from().where()` resolves
    // biome-ignore lint/suspicious/noThenProperty: drizzle ORM mock requires .then for await chaining
    then: (
      resolve: (v: unknown[]) => unknown,
      reject?: (e: unknown) => unknown
    ): Promise<unknown> => Promise.resolve(rows).then(resolve, reject),
    catch: (onRej: (e: unknown) => unknown) => Promise.resolve(rows).catch(onRej),
    finally: (fn: () => void) => Promise.resolve(rows).finally(fn),
  };
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResult),
    }),
  };
}

async function buildApp(opts: {
  existingCreds?: { credentialId: string }[];
  storedCred?: typeof MOCK_CRED_ROW | null;
  sessionOverrides?: Record<string, unknown>;
  // Override the full select sequence for fine-grained control
  selectSequence?: unknown[][];
}) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const existingCreds = opts.existingCreds ?? [{ credentialId: CRED_ID }];
  const storedResult = opts.storedCred !== undefined ? [opts.storedCred] : [MOCK_CRED_ROW];

  // Default sequence covers register/options (creds + staffRow) then verify (stored cred)
  const selectSequence = opts.selectSequence ?? [
    existingCreds,
    [{ name: 'Test Staff' }],
    storedResult,
  ];
  let selectCallN = 0;

  const mockDb = {
    select: vi.fn().mockImplementation(() => {
      const rows = selectSequence[selectCallN] ?? storedResult;
      selectCallN++;
      return makeSelectChain(rows);
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };

  app.decorate('db', mockDb as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, email: 'staff@test.com', role: 'admin' },
      webauthnChallenge: 'reg-challenge-abc',
      webauthnChallengeExpiresAt: Date.now() + 60_000,
      ...opts.sessionOverrides,
    } as unknown as typeof req.session;
  });

  const { webauthnRoutes } = await import('../auth/webauthn-routes.js');
  await app.register(webauthnRoutes, {
    cfg: {
      ...WEBAUTHN_CFG,
      // minimal cfg fields needed
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_REDIRECT_URI: '',
      GOOGLE_WORKSPACE_DOMAIN: '',
      DATABASE_URL: '',
      REDIS_URL: '',
      SESSION_SECRET: '',
      CORS_ORIGIN: '',
      INTERNAL_BEARER_TOKEN: '',
      NODE_ENV: 'test',
      PORT: 3000,
    } as never,
  });
  await app.ready();
  return { app, mockDb };
}

// ── POST /auth/webauthn/register/options ───────────────────────────────────────

describe('POST /auth/webauthn/register/options', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with registration options', async () => {
    const { app } = await buildApp({ existingCreds: [] });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/register/options',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.challenge).toBe('reg-challenge-abc');
  });

  it('stores challenge in session and passes excludeCredentials', async () => {
    const { buildRegistrationOptions } = await import('../auth/webauthn-server.js');
    const { app } = await buildApp({ existingCreds: [{ credentialId: CRED_ID }] });
    await app.inject({
      method: 'POST',
      url: '/auth/webauthn/register/options',
      headers: { 'content-type': 'application/json' },
      payload: { deviceName: 'My Key' },
    });
    await app.close();

    expect(buildRegistrationOptions).toHaveBeenCalled();
  });
});

// ── POST /auth/webauthn/register/verify ────────────────────────────────────────

describe('POST /auth/webauthn/register/verify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with credentialId on successful verification', async () => {
    const { app } = await buildApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/register/verify',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'cred-response', rawId: 'rawId', type: 'public-key', response: {} },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.credentialId).toBe('cred-id-base64');
  });

  it('returns 400 CHALLENGE_EXPIRED when challenge is missing', async () => {
    const { app } = await buildApp({
      sessionOverrides: { webauthnChallenge: undefined, webauthnChallengeExpiresAt: undefined },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/register/verify',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'cred' },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('CHALLENGE_EXPIRED');
  });

  it('returns 400 CHALLENGE_EXPIRED when challenge has expired', async () => {
    const { app } = await buildApp({
      sessionOverrides: {
        webauthnChallenge: 'old-challenge',
        webauthnChallengeExpiresAt: Date.now() - 1000,
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/register/verify',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'cred' },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('CHALLENGE_EXPIRED');
  });

  it('returns 400 VERIFICATION_FAILED when confirmRegistration throws', async () => {
    const { confirmRegistration } = await import('../auth/webauthn-server.js');
    vi.mocked(confirmRegistration).mockRejectedValueOnce(new Error('bad attestation'));

    const { app } = await buildApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/register/verify',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'cred' },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('VERIFICATION_FAILED');
  });

  it('returns 400 VERIFICATION_FAILED when verification.verified is false', async () => {
    const { confirmRegistration } = await import('../auth/webauthn-server.js');
    vi.mocked(confirmRegistration).mockResolvedValueOnce({ verified: false } as never);

    const { app } = await buildApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/register/verify',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'cred' },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('VERIFICATION_FAILED');
  });
});

// ── POST /auth/webauthn/challenge ──────────────────────────────────────────────

describe('POST /auth/webauthn/challenge', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-apply mock implementations after clearAllMocks() wipes them
    const { buildAuthenticationOptions } = await import('../auth/webauthn-server.js');
    vi.mocked(buildAuthenticationOptions).mockResolvedValue({
      challenge: 'auth-challenge-xyz',
      rpId: 'localhost',
      allowCredentials: [],
      timeout: 60000,
      userVerification: 'preferred',
    } as never);
  });

  it('returns 200 with authentication options and stores challenge', async () => {
    const { app } = await buildApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/challenge',
    });
    await app.close();

    if (res.statusCode !== 200) {
      console.log('challenge body:', res.body);
    }
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.challenge).toBe('auth-challenge-xyz');
  });
});

// ── POST /auth/webauthn/verify ─────────────────────────────────────────────────

describe('POST /auth/webauthn/verify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with steppedUpAt on successful assertion', async () => {
    const { app } = await buildApp({
      selectSequence: [[MOCK_CRED_ROW]],
    });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/verify',
      headers: { 'content-type': 'application/json' },
      payload: { id: CRED_ID, rawId: CRED_ID, type: 'public-key', response: {} },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(typeof body.steppedUpAt).toBe('string');
  });

  it('returns 400 CHALLENGE_EXPIRED when challenge missing', async () => {
    const { app } = await buildApp({
      sessionOverrides: { webauthnChallenge: undefined, webauthnChallengeExpiresAt: undefined },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/verify',
      headers: { 'content-type': 'application/json' },
      payload: { id: CRED_ID },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('CHALLENGE_EXPIRED');
  });

  it('returns 400 MISSING_CREDENTIAL_ID when response has no id field', async () => {
    const { app } = await buildApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/verify',
      headers: { 'content-type': 'application/json' },
      payload: { type: 'public-key' }, // no id field
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('MISSING_CREDENTIAL_ID');
  });

  it('returns 400 CREDENTIAL_NOT_FOUND when credential not registered', async () => {
    // /verify only makes one select call — for the stored credential
    const { app } = await buildApp({ selectSequence: [[]] }); // empty = not found
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/verify',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'unknown-cred-id' },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('CREDENTIAL_NOT_FOUND');
  });

  it('returns 400 VERIFICATION_FAILED when confirmAuthentication throws', async () => {
    const { confirmAuthentication } = await import('../auth/webauthn-server.js');
    vi.mocked(confirmAuthentication).mockRejectedValueOnce(new Error('signature mismatch'));

    const { app } = await buildApp({ selectSequence: [[MOCK_CRED_ROW]] });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/verify',
      headers: { 'content-type': 'application/json' },
      payload: { id: CRED_ID },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('VERIFICATION_FAILED');
  });

  it('returns 400 VERIFICATION_FAILED when verified=false', async () => {
    const { confirmAuthentication } = await import('../auth/webauthn-server.js');
    vi.mocked(confirmAuthentication).mockResolvedValueOnce({
      verified: false,
      authenticationInfo: { newCounter: 0 },
    } as never);

    const { app } = await buildApp({ selectSequence: [[MOCK_CRED_ROW]] });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/webauthn/verify',
      headers: { 'content-type': 'application/json' },
      payload: { id: CRED_ID },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('VERIFICATION_FAILED');
  });
});
