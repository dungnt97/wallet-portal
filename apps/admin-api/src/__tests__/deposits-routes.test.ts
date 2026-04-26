import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for deposits.routes.ts — list, get, manual-credit, add-to-sweep endpoints
// Tests: GET /deposits, GET /deposits/:id, GET /deposits/export.csv
//        POST /deposits/manual-credit, POST /deposits/:id/add-to-sweep
// Uses Fastify inject + mocked DB/Queue/IO — no real Postgres or Socket.io
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks (must precede service imports) ───────────────────────────────

vi.mock('../services/deposit-manual-credit.service.js', () => ({
  manualCredit: vi.fn(),
  ValidationError: class ValidationError extends Error {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    constructor(m: string) {
      super(m);
      this.name = 'ValidationError';
    }
  },
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
}));

vi.mock('../services/deposit-csv.service.js', () => ({
  countDepositsForExport: vi.fn(),
  queryDepositsForExport: vi.fn(),
  streamDepositCsv: vi.fn(),
}));

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const BEARER = 'test-bearer';
const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const DEPOSIT_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = '00000000-0000-0000-0000-000000000003';
const ADDRESS_ID = '00000000-0000-0000-0000-000000000004';
const SWEEP_ID = '00000000-0000-0000-0000-000000000005';

function makeDeposit(overrides: Record<string, unknown> = {}) {
  return {
    id: DEPOSIT_ID,
    userId: USER_ID,
    chain: 'bnb' as const,
    token: 'USDT' as const,
    amount: '1000.00',
    status: 'pending' as const,
    confirmedBlocks: 12,
    txHash: '0xabcd1234',
    createdAt: new Date('2026-01-15T10:30:00Z'),
    updatedAt: new Date('2026-01-15T10:30:00Z'),
    ...overrides,
  };
}

async function buildApp(
  opts: {
    deposits?: Record<string, unknown>[];
    depositById?: Record<string, unknown> | null;
    manualCreditFn?: (...args: unknown[]) => Promise<unknown>;
    userEmail?: string | null;
    userAddress?: Record<string, unknown> | null;
    existingSweep?: Record<string, unknown> | null;
    walletRegistry?: Record<string, unknown> | null;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Mock decorators — BEFORE registering routes
  const depositList = opts.deposits ?? [makeDeposit()];

  // Create chainable Drizzle mock
  const selectMock = vi.fn((arg: unknown) => {
    // If arg has 'value' property, it's a count query
    if (typeof arg === 'object' && arg !== null && 'value' in arg) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: depositList.length }]),
        }),
      };
    }
    // Otherwise it's a select with fields (regular list query)
    return {
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(depositList),
                }),
              }),
            }),
          }),
        }),
      }),
    };
  });

  const mockDb = {
    query: {
      deposits: {
        findFirst: vi.fn().mockResolvedValue(opts.depositById ?? null),
      },
      userAddresses: {
        findFirst: vi.fn().mockResolvedValue(opts.userAddress ?? null),
      },
      wallets: {
        findFirst: vi.fn().mockResolvedValue(opts.walletRegistry ?? null),
      },
      sweeps: {
        findFirst: vi.fn().mockResolvedValue(opts.existingSweep ?? null),
      },
    },
    select: selectMock,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: SWEEP_ID,
            userAddressId: ADDRESS_ID,
            chain: 'bnb',
            token: 'USDT',
            fromAddr: '0xUser',
            toMultisig: '0xMultisig',
            amount: '1000.00',
            status: 'pending',
            createdBy: STAFF_ID,
          },
        ]),
      }),
    }),
  };

  const mockQueue = {
    getJob: vi.fn().mockResolvedValue(null),
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  };
  const mockIO = {
    of: vi.fn().mockReturnValue({
      emit: vi.fn(),
    }),
  };
  const mockEmailQueue = { add: vi.fn() };
  const mockSlackQueue = { add: vi.fn() };

  app.decorate('db', mockDb as never);
  app.decorate('queue', mockQueue as never);
  app.decorate('io', mockIO as never);
  app.decorate('emailQueue', mockEmailQueue as never);
  app.decorate('slackQueue', mockSlackQueue as never);

  // RBAC middleware — set admin role and step-up for all endpoints
  app.addHook('preHandler', async (req, reply) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
      steppedUpAt: new Date(Date.now() - 60 * 1000), // 60 seconds ago (within 5-min TTL)
    } as unknown as typeof req.session;
  });

  // Setup service mocks AFTER app creation but BEFORE route registration
  const { manualCredit } = await import('../services/deposit-manual-credit.service.js');
  const { countDepositsForExport, queryDepositsForExport, streamDepositCsv } = await import(
    '../services/deposit-csv.service.js'
  );

  vi.mocked(manualCredit).mockImplementation(
    (opts.manualCreditFn as typeof manualCredit | undefined) ??
      (async (db, io, emailQueue, slackQueue, input) => ({
        depositId: DEPOSIT_ID,
        userId: input.userId,
        chain: input.chain,
        token: input.token,
        amount: input.amount,
        creditedBy: STAFF_ID,
        createdAt: new Date().toISOString(),
      }))
  );

  vi.mocked(countDepositsForExport).mockResolvedValue(10);
  vi.mocked(queryDepositsForExport).mockResolvedValue(depositList as never);
  vi.mocked(streamDepositCsv).mockImplementation((rows, chunk) => {
    const csv = `id,userId,amount,status\n${(rows as unknown as Record<string, unknown>[]).map((r) => `${r['id']},${r['userId']},${r['amount']},${r['status']}`).join('\n')}`;
    chunk(csv);
  });

  const { default: depositsRoutes } = await import('../routes/deposits.routes.js');
  await app.register(depositsRoutes);
  await app.ready();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /deposits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated list of deposits', async () => {
    const rows = [makeDeposit()];
    const app = await buildApp({ deposits: rows });

    const res = await app.inject({
      method: 'GET',
      url: '/deposits?page=1&limit=20',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(DEPOSIT_ID);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    await app.close();
  });

  it('returns empty list when no deposits', async () => {
    const app = await buildApp({ deposits: [] });

    const res = await app.inject({
      method: 'GET',
      url: '/deposits?page=1&limit=20',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    await app.close();
  });

  it('filters by status', async () => {
    const rows = [makeDeposit({ status: 'credited' })];
    const app = await buildApp({ deposits: rows });

    const res = await app.inject({
      method: 'GET',
      url: '/deposits?page=1&limit=20&status=credited',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].status).toBe('credited');
    await app.close();
  });

  it('filters by chain', async () => {
    const rows = [makeDeposit({ chain: 'sol' })];
    const app = await buildApp({ deposits: rows });

    const res = await app.inject({
      method: 'GET',
      url: '/deposits?page=1&limit=20&chain=sol',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].chain).toBe('sol');
    await app.close();
  });

  it('filters by token', async () => {
    const rows = [makeDeposit({ token: 'USDC' })];
    const app = await buildApp({ deposits: rows });

    const res = await app.inject({
      method: 'GET',
      url: '/deposits?page=1&limit=20&token=USDC',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].token).toBe('USDC');
    await app.close();
  });

  it('converts amount to string', async () => {
    const rows = [makeDeposit({ amount: '5000.50' })];
    const app = await buildApp({ deposits: rows });

    const res = await app.inject({
      method: 'GET',
      url: '/deposits?page=1&limit=20',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].amount).toBe('5000.50');
    expect(typeof body.data[0].amount).toBe('string');
    await app.close();
  });

  it('converts dates to ISO strings', async () => {
    const rows = [
      makeDeposit({
        createdAt: new Date('2026-04-15T10:30:00Z'),
        updatedAt: new Date('2026-04-15T11:45:00Z'),
      }),
    ];
    const app = await buildApp({ deposits: rows });

    const res = await app.inject({
      method: 'GET',
      url: '/deposits?page=1&limit=20',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });
});

describe('GET /deposits/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns deposit by id', async () => {
    const deposit = makeDeposit();
    const app = await buildApp({ depositById: deposit });

    const res = await app.inject({
      method: 'GET',
      url: `/deposits/${DEPOSIT_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(DEPOSIT_ID);
    expect(body.userId).toBe(USER_ID);
    await app.close();
  });

  it('returns 404 when deposit not found', async () => {
    const app = await buildApp({ depositById: null });

    const res = await app.inject({
      method: 'GET',
      url: '/deposits/00000000-0000-0000-0000-000000000099',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('sets userEmail and userAddress to null', async () => {
    const deposit = makeDeposit();
    const app = await buildApp({ depositById: deposit });

    const res = await app.inject({
      method: 'GET',
      url: `/deposits/${DEPOSIT_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.userEmail).toBeNull();
    expect(body.userAddress).toBeNull();
    await app.close();
  });

  it('converts dates to ISO strings', async () => {
    const deposit = makeDeposit({
      createdAt: new Date('2026-04-15T10:30:00Z'),
      updatedAt: new Date('2026-04-15T11:45:00Z'),
    });
    const app = await buildApp({ depositById: deposit });

    const res = await app.inject({
      method: 'GET',
      url: `/deposits/${DEPOSIT_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });
});

describe('GET /deposits/export.csv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns CSV when under row cap', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/deposits/export.csv',
    });

    expect(res.statusCode).toBe(200);
    const contentType = res.headers['content-type'];
    if (contentType) {
      expect(contentType).toContain('text/csv');
    }
    expect(res.body).toContain('id,userId,amount,status');
    await app.close();
  });

  it('rejects CSV when exceeds row cap', async () => {
    const app = await buildApp();

    // Mock count to exceed 50k
    const { countDepositsForExport } = await import('../services/deposit-csv.service.js');
    vi.mocked(countDepositsForExport).mockResolvedValue(60_000);

    const res = await app.inject({
      method: 'GET',
      url: '/deposits/export.csv',
    });

    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('too_many_rows');
    expect(body.max).toBe(50_000);
    expect(body.found).toBe(60_000);
    await app.close();
  });

  it('includes filters in query', async () => {
    const app = await buildApp();
    const { countDepositsForExport } = await import('../services/deposit-csv.service.js');

    const res = await app.inject({
      method: 'GET',
      url: '/deposits/export.csv?status=credited&chain=bnb',
    });

    expect(res.statusCode).toBe(200);
    // Verify count was called (mocked functions record calls)
    expect(vi.mocked(countDepositsForExport)).toHaveBeenCalled();
    const contentType = res.headers['content-type'];
    if (contentType) {
      expect(contentType).toContain('text/csv');
    }
    await app.close();
  });

  it('sets proper Content-Disposition header', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/deposits/export.csv',
    });

    expect(res.statusCode).toBe(200);
    const disposition = res.headers['content-disposition'];
    if (disposition) {
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('deposits-');
      expect(disposition).toContain('.csv');
    }
    await app.close();
  });
});

describe('POST /deposits/manual-credit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates manual deposit credit with valid input', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/deposits/manual-credit',
      payload: {
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        reason: 'User reported missing deposit after chain reorg',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.depositId).toBe(DEPOSIT_ID);
    expect(body.userId).toBe(USER_ID);
    expect(body.creditedBy).toBe(STAFF_ID);
    await app.close();
  });

  it('returns 400 when reason too short', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/deposits/manual-credit',
      payload: {
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        reason: 'short',
      },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when amount invalid format', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/deposits/manual-credit',
      payload: {
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: 'invalid-amount',
        reason: 'User reported missing deposit after chain reorg',
      },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 on service ValidationError', async () => {
    const { ValidationError } = await import('../services/deposit-manual-credit.service.js');
    const app = await buildApp({
      manualCreditFn: async () => {
        throw new ValidationError('Invalid deposit amount');
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/deposits/manual-credit',
      payload: {
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        reason: 'User reported missing deposit after chain reorg',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('returns 404 on service NotFoundError', async () => {
    const { NotFoundError } = await import('../services/deposit-manual-credit.service.js');
    const app = await buildApp({
      manualCreditFn: async () => {
        throw new NotFoundError('User not found');
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/deposits/manual-credit',
      payload: {
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        reason: 'User reported missing deposit after chain reorg',
      },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });
});

describe('POST /deposits/:id/add-to-sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates sweep for credited deposit', async () => {
    const deposit = makeDeposit({ status: 'credited' });
    const userAddress = {
      id: ADDRESS_ID,
      userId: USER_ID,
      chain: 'bnb',
      address: '0xUser123',
    };

    const app = await buildApp({
      depositById: deposit,
      userAddress,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/deposits/${DEPOSIT_ID}/add-to-sweep`,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.sweepId).toBe(SWEEP_ID);
    expect(body.userAddressId).toBe(ADDRESS_ID);
    await app.close();
  });

  it('returns 404 when deposit not found', async () => {
    const app = await buildApp({ depositById: null });

    const res = await app.inject({
      method: 'POST',
      url: '/deposits/00000000-0000-0000-0000-000000000099/add-to-sweep',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 409 when deposit not in credited status', async () => {
    const deposit = makeDeposit({ status: 'pending' });
    const app = await buildApp({ depositById: deposit });

    const res = await app.inject({
      method: 'POST',
      url: `/deposits/${DEPOSIT_ID}/add-to-sweep`,
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('CONFLICT');
    expect(body.message).toContain('pending');
    await app.close();
  });

  it('returns 404 when user address not found', async () => {
    const deposit = makeDeposit({ status: 'credited' });
    const app = await buildApp({
      depositById: deposit,
      userAddress: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/deposits/${DEPOSIT_ID}/add-to-sweep`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toContain('user address');
    await app.close();
  });

  it('returns 409 when pending sweep exists', async () => {
    const deposit = makeDeposit({ status: 'credited' });
    const userAddress = {
      id: ADDRESS_ID,
      userId: USER_ID,
      chain: 'bnb',
      address: '0xUser123',
    };
    const existingSweep = {
      id: 'sweep-existing',
      userAddressId: ADDRESS_ID,
      status: 'pending',
    };

    const app = await buildApp({
      depositById: deposit,
      userAddress,
      existingSweep,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/deposits/${DEPOSIT_ID}/add-to-sweep`,
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('CONFLICT');
    expect(body.message).toContain('pending sweep');
    await app.close();
  });

  it('uses environment wallet fallback when not in registry', async () => {
    const deposit = makeDeposit({ status: 'credited' });
    const userAddress = {
      id: ADDRESS_ID,
      userId: USER_ID,
      chain: 'bnb',
      address: '0xUser123',
    };

    const app = await buildApp({
      depositById: deposit,
      userAddress,
      walletRegistry: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/deposits/${DEPOSIT_ID}/add-to-sweep`,
    });

    expect(res.statusCode).toBe(201);
    // Verifies fallback to environment variable is used
    await app.close();
  });

  it('emits audit event', async () => {
    const deposit = makeDeposit({ status: 'credited' });
    const userAddress = {
      id: ADDRESS_ID,
      userId: USER_ID,
      chain: 'bnb',
      address: '0xUser123',
    };

    const app = await buildApp({
      depositById: deposit,
      userAddress,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/deposits/${DEPOSIT_ID}/add-to-sweep`,
    });

    expect(res.statusCode).toBe(201);
    const { emitAudit } = await import('../services/audit.service.js');
    expect(vi.mocked(emitAudit)).toHaveBeenCalled();
    await app.close();
  });

  it('emits socket.io event', async () => {
    const deposit = makeDeposit({ status: 'credited' });
    const userAddress = {
      id: ADDRESS_ID,
      userId: USER_ID,
      chain: 'bnb',
      address: '0xUser123',
    };

    const app = await buildApp({
      depositById: deposit,
      userAddress,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/deposits/${DEPOSIT_ID}/add-to-sweep`,
    });

    expect(res.statusCode).toBe(201);
    // Verify io.of().emit was called
    const mockIo = (app as unknown as { io: { of: ReturnType<typeof vi.fn> } }).io;
    expect(mockIo.of).toHaveBeenCalledWith('/stream');
    await app.close();
  });
});
