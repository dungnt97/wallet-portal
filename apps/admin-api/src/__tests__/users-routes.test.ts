import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for users.routes.ts
// Tests: GET /users, GET /users/:id, POST /users, PATCH /users/:id/kyc,
//        GET /users/:id/balance, GET /users/:id/addresses,
//        POST /users/:id/derive-addresses, PATCH /users/:id/risk
// Uses Fastify inject + mocked services — no real Postgres
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/user-list-query.service.js', () => ({
  listUsers: vi.fn(),
}));

vi.mock('../services/user-create.service.js', () => ({
  createUser: vi.fn(),
  ConflictError: class ConflictError extends Error {
    statusCode = 409;
    code = 'CONFLICT';
    constructor(m: string) {
      super(m);
      this.name = 'ConflictError';
    }
  },
  DerivationFailedError: class DerivationFailedError extends Error {
    statusCode = 502;
    code = 'DERIVATION_FAILED';
    userId: string;
    constructor(m: string, userId: string) {
      super(m);
      this.name = 'DerivationFailedError';
      this.userId = userId;
    }
  },
}));

vi.mock('../services/user-kyc-update.service.js', () => ({
  updateUserKyc: vi.fn(),
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  ValidationError: class ValidationError extends Error {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    constructor(m: string) {
      super(m);
      this.name = 'ValidationError';
    }
  },
}));

vi.mock('../services/user-balance-query.service.js', () => ({
  getUserBalance: vi.fn(),
}));

vi.mock('../services/user-addresses-query.service.js', () => ({
  getUserAddresses: vi.fn(),
}));

vi.mock('../services/user-retry-derive.service.js', () => ({
  retryDeriveUserAddresses: vi.fn(),
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  DerivationFailedError: class DerivationFailedError extends Error {
    statusCode = 502;
    code = 'DERIVATION_FAILED';
    constructor(m: string) {
      super(m);
      this.name = 'DerivationFailedError';
    }
  },
}));

vi.mock('../services/user-risk.service.js', () => ({
  updateRiskTier: vi.fn(),
}));

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'alice@example.com',
    kycTier: 'basic' as const,
    riskScore: 0,
    status: 'active' as const,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

async function buildApp(
  opts: {
    userById?: Record<string, unknown> | null;
    addrRows?: Record<string, unknown>[];
    listUsersFn?: (...args: unknown[]) => Promise<unknown>;
    createUserFn?: (...args: unknown[]) => Promise<unknown>;
    updateKycFn?: (...args: unknown[]) => Promise<unknown>;
    getBalanceFn?: (...args: unknown[]) => Promise<unknown>;
    getAddressesFn?: (...args: unknown[]) => Promise<unknown>;
    retryDeriveFn?: (...args: unknown[]) => Promise<unknown>;
    updateRiskFn?: (...args: unknown[]) => Promise<unknown>;
    steppedUp?: boolean;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const addrRows = opts.addrRows ?? [];

  const mockDb = {
    query: {
      users: {
        findFirst: vi
          .fn()
          .mockResolvedValue(opts.userById === undefined ? makeUser() : opts.userById),
      },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(addrRows),
      }),
    }),
  };

  const mockRedis = {};

  app.decorate('db', mockDb as never);
  app.decorate('redis', mockRedis as never);

  const steppedUpAt = opts.steppedUp === false ? undefined : new Date(Date.now() - 60 * 1000);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
      steppedUpAt,
      destroy: vi.fn().mockResolvedValue(undefined),
    } as unknown as typeof req.session;
  });

  const { listUsers } = await import('../services/user-list-query.service.js');
  const { createUser } = await import('../services/user-create.service.js');
  const { updateUserKyc } = await import('../services/user-kyc-update.service.js');
  const { getUserBalance } = await import('../services/user-balance-query.service.js');
  const { getUserAddresses } = await import('../services/user-addresses-query.service.js');
  const { retryDeriveUserAddresses } = await import('../services/user-retry-derive.service.js');
  const { updateRiskTier } = await import('../services/user-risk.service.js');

  vi.mocked(listUsers).mockImplementation(
    opts.listUsersFn ??
      (async () => ({
        data: [makeUser()],
        total: 1,
        page: 1,
      }))
  );

  vi.mocked(createUser).mockImplementation(
    opts.createUserFn ??
      (async () => ({
        user: makeUser(),
        addresses: [
          {
            chain: 'bnb',
            address: '0xABC',
            derivationPath: "m/44'/60'/0'/0/0",
            derivationIndex: 0,
          },
        ],
      }))
  );

  vi.mocked(updateUserKyc).mockImplementation(
    opts.updateKycFn ?? (async () => ({ user: makeUser({ kycTier: 'enhanced' }) }))
  );

  vi.mocked(getUserBalance).mockImplementation(
    opts.getBalanceFn ?? (async () => ({ USDT: '100.00', USDC: '0.00' }))
  );

  vi.mocked(getUserAddresses).mockImplementation(
    opts.getAddressesFn ??
      (async () => [
        {
          id: '00000000-0000-0000-0000-000000000010',
          userId: USER_ID,
          chain: 'bnb',
          address: '0xABC',
          derivationPath: "m/44'/60'/0'/0/0",
          derivationIndex: 0,
          tier: 'hot',
          createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
          balance: { USDT: '0', USDC: '0' },
          cached: false,
        },
      ])
  );

  vi.mocked(retryDeriveUserAddresses).mockImplementation(
    opts.retryDeriveFn ??
      (async () => ({
        addresses: [
          {
            chain: 'bnb',
            address: '0xABC',
            derivationPath: "m/44'/60'/0'/0/0",
            derivationIndex: 0,
          },
        ],
        alreadyComplete: false,
      }))
  );

  vi.mocked(updateRiskTier).mockImplementation(
    opts.updateRiskFn ??
      (async () => ({
        userId: USER_ID,
        riskTier: 'high' as const,
        riskReason: 'suspicious activity',
        riskUpdatedAt: new Date().toISOString(),
        riskUpdatedBy: STAFF_ID,
      }))
  );

  const { default: usersRoutes } = await import('../routes/users.routes.js');
  await app.register(usersRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /users ─────────────────────────────────────────────────────────

describe('GET /users', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated list of users', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users?page=1&limit=20' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(USER_ID);
    expect(body.page).toBe(1);
    await app.close();
  });

  it('passes filters to listUsers', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/users?page=1&limit=10&kycTier=basic&status=active&q=alice',
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns empty list when no users', async () => {
    const app = await buildApp({
      listUsersFn: async () => ({ data: [], total: 0, page: 1 }),
    });
    const res = await app.inject({ method: 'GET', url: '/users?page=1&limit=20' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    await app.close();
  });
});

// ── Tests: GET /users/:id ─────────────────────────────────────────────────────

describe('GET /users/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns user with address count', async () => {
    const app = await buildApp({ addrRows: [{ id: 'addr-1' }, { id: 'addr-2' }] });
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.id).toBe(USER_ID);
    expect(body.addressCount).toBe(2);
    await app.close();
  });

  it('returns 404 when user not found', async () => {
    const app = await buildApp({ userById: null });
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}` });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 400 for non-uuid id', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/not-a-uuid' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: POST /users ────────────────────────────────────────────────────────

describe('POST /users', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates user and returns 201', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'new@example.com', kycTier: 'none' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user.id).toBe(USER_ID);
    expect(body.addresses).toHaveLength(1);
    await app.close();
  });

  it('returns 409 on ConflictError', async () => {
    const { ConflictError } = await import('../services/user-create.service.js');
    const app = await buildApp({
      createUserFn: async () => {
        throw new ConflictError('Email already exists');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'dup@example.com' },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('CONFLICT');
    await app.close();
  });

  it('returns 502 on DerivationFailedError', async () => {
    const { DerivationFailedError } = await import('../services/user-create.service.js');
    const app = await buildApp({
      createUserFn: async () => {
        throw new DerivationFailedError('wallet-engine down', USER_ID);
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'partial@example.com' },
    });
    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('DERIVATION_FAILED');
    expect(body.userId).toBe(USER_ID);
    await app.close();
  });

  it('returns 400 for invalid email', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: PATCH /users/:id/kyc ───────────────────────────────────────────────

describe('PATCH /users/:id/kyc', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates KYC tier', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${USER_ID}/kyc`,
      payload: { kycTier: 'enhanced' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.kycTier).toBe('enhanced');
    await app.close();
  });

  it('returns 404 when user not found', async () => {
    const { NotFoundError } = await import('../services/user-kyc-update.service.js');
    const app = await buildApp({
      updateKycFn: async () => {
        throw new NotFoundError('User not found');
      },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${USER_ID}/kyc`,
      payload: { kycTier: 'basic' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 400 on ValidationError', async () => {
    const { ValidationError } = await import('../services/user-kyc-update.service.js');
    const app = await buildApp({
      updateKycFn: async () => {
        throw new ValidationError('Invalid tier transition');
      },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${USER_ID}/kyc`,
      payload: { kycTier: 'none' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: GET /users/:id/balance ─────────────────────────────────────────────

describe('GET /users/:id/balance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns user balance', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}/balance` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.USDT).toBeDefined();
    expect(body.USDC).toBeDefined();
    await app.close();
  });

  it('returns 404 when user not found', async () => {
    const app = await buildApp({ userById: null });
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}/balance` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ── Tests: GET /users/:id/addresses ──────────────────────────────────────────

describe('GET /users/:id/addresses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns user addresses', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}/addresses` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.addresses)).toBe(true);
    await app.close();
  });

  it('returns 404 when user not found', async () => {
    const app = await buildApp({ userById: null });
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}/addresses` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ── Tests: POST /users/:id/derive-addresses ───────────────────────────────────

describe('POST /users/:id/derive-addresses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retries derivation successfully', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/users/${USER_ID}/derive-addresses`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.alreadyComplete).toBe(false);
    expect(body.addresses).toHaveLength(1);
    await app.close();
  });

  it('returns 404 when user not found', async () => {
    const { NotFoundError } = await import('../services/user-retry-derive.service.js');
    const app = await buildApp({
      retryDeriveFn: async () => {
        throw new NotFoundError('User not found');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/users/${USER_ID}/derive-addresses`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 502 on derivation failure', async () => {
    const { DerivationFailedError } = await import('../services/user-retry-derive.service.js');
    const app = await buildApp({
      retryDeriveFn: async () => {
        throw new DerivationFailedError('wallet-engine timeout');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/users/${USER_ID}/derive-addresses`,
    });
    expect(res.statusCode).toBe(502);
    await app.close();
  });
});

// ── Tests: PATCH /users/:id/risk ─────────────────────────────────────────────

describe('PATCH /users/:id/risk', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates risk tier with step-up session', async () => {
    const app = await buildApp({ steppedUp: true });
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${USER_ID}/risk`,
      payload: { tier: 'high', reason: 'suspicious activity detected' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.riskTier).toBe('high');
    await app.close();
  });

  it('returns 404 when user not found', async () => {
    const app = await buildApp({
      steppedUp: true,
      updateRiskFn: async () => {
        throw new Error('User not found');
      },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${USER_ID}/risk`,
      payload: { tier: 'frozen', reason: 'compliance hold required' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 400 on validation error', async () => {
    const app = await buildApp({
      steppedUp: true,
      updateRiskFn: async () => {
        throw new Error('Invalid transition');
      },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${USER_ID}/risk`,
      payload: { tier: 'low', reason: 'cleared after review' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 for missing reason', async () => {
    const app = await buildApp({ steppedUp: true });
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${USER_ID}/risk`,
      payload: { tier: 'high' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
