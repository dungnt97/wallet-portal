import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for dev-seed.routes.ts
// Tests: POST /dev/seed/withdrawal, POST /dev/seed/deposit
// Guards: process.exit(1) when NODE_ENV=production (tested via spy)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Test helpers ──────────────────────────────────────────────────────────────

const USER_ID = '00000000-0000-0000-0000-000000000001';
const STAFF_ID = '00000000-0000-0000-0000-000000000002';
const WITHDRAWAL_ID = '00000000-0000-0000-0000-000000000003';
const DEPOSIT_ID = '00000000-0000-0000-0000-000000000004';

async function buildApp(
  opts: {
    withdrawalId?: string;
    depositId?: string;
    existingUser?: { id: string } | null;
    newUserId?: string;
  } = {}
) {
  const withdrawalId = opts.withdrawalId ?? WITHDRAWAL_ID;
  const depositId = opts.depositId ?? DEPOSIT_ID;
  const existingUser = opts.existingUser === undefined ? { id: USER_ID } : opts.existingUser;
  const newUserId = opts.newUserId ?? USER_ID;

  const mockInsert = vi.fn().mockImplementation((table: unknown) => {
    // Return withdrawal insert result
    return {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation((fields: unknown) => {
          // withdrawal insert → returns {id}
          if (typeof fields === 'object' && fields !== null && 'id' in fields) {
            const key = String(table);
            if (key.includes('withdrawal') || depositId) {
              return Promise.resolve([{ id: withdrawalId }]);
            }
          }
          return Promise.resolve([{ id: depositId }]);
        }),
      }),
    };
  });

  // Smarter insert that distinguishes withdrawal vs user vs deposit by call order
  let insertCallN = 0;
  const mockInsertSmart = vi.fn(() => {
    insertCallN++;
    const callN = insertCallN;
    return {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(
          callN === 1 && !existingUser
            ? [{ id: newUserId }] // user insert
            : callN === 1 || (callN === 2 && !existingUser)
              ? [{ id: withdrawalId }] // withdrawal or deposit insert
              : [{ id: depositId }]
        ),
      }),
    };
  });

  // Separate deposit flow: call 1 = user insert (if no existing), call 2 = deposit insert
  let depositInsertN = 0;
  const mockDepositInsert = vi.fn(() => {
    depositInsertN++;
    return {
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(
            depositInsertN === 1 && !existingUser ? [{ id: newUserId }] : [{ id: depositId }]
          ),
      }),
    };
  });

  const mockDb = {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: withdrawalId }]),
      }),
    }),
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue(existingUser),
      },
    },
  };

  // Override insert to be smarter: track which table
  let withdrawalInsertDone = false;
  mockDb.insert = vi.fn(() => {
    return {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          if (!withdrawalInsertDone) {
            withdrawalInsertDone = true;
            return Promise.resolve([{ id: withdrawalId }]);
          }
          return Promise.resolve([{ id: depositId }]);
        }),
      }),
    };
  });

  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('db', mockDb as never);

  const { default: devSeedRoutes } = await import('../routes/dev-seed.routes.js');
  await app.register(devSeedRoutes);
  await app.ready();
  return { app, mockDb };
}

// ── Tests: POST /dev/seed/withdrawal ─────────────────────────────────────────

describe('POST /dev/seed/withdrawal', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    vi.clearAllMocks();
  });

  it('inserts withdrawal and returns 201 with id', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/dev/seed/withdrawal',
      payload: { userId: USER_ID, createdBy: STAFF_ID },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(WITHDRAWAL_ID);
    await app.close();
  });

  it('uses default chain=bnb and token=USDT', async () => {
    const { app, mockDb } = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/dev/seed/withdrawal',
      payload: { userId: USER_ID, createdBy: STAFF_ID },
    });
    const insertArgs = mockDb.insert.mock.calls[0];
    expect(insertArgs).toBeDefined();
    await app.close();
  });

  it('accepts all optional overrides', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/dev/seed/withdrawal',
      payload: {
        userId: USER_ID,
        createdBy: STAFF_ID,
        chain: 'sol',
        token: 'USDC',
        amount: '100',
        destinationAddr: '5NwQ...',
        sourceTier: 'cold',
      },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('returns 400 for missing required userId', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/dev/seed/withdrawal',
      payload: { createdBy: STAFF_ID },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 for non-uuid userId', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/dev/seed/withdrawal',
      payload: { userId: 'not-a-uuid', createdBy: STAFF_ID },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: POST /dev/seed/deposit ─────────────────────────────────────────────

describe('POST /dev/seed/deposit', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    vi.clearAllMocks();
  });

  it('inserts deposit using existing user and returns 201 with id', async () => {
    // Build a fresh app with correct insert tracking for deposit
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: DEPOSIT_ID }]),
        }),
      }),
      query: {
        users: { findFirst: vi.fn().mockResolvedValue({ id: USER_ID }) },
      },
    };
    app.decorate('db', mockDb as never);
    const { default: devSeedRoutes } = await import('../routes/dev-seed.routes.js');
    await app.register(devSeedRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/dev/seed/deposit',
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).id).toBe(DEPOSIT_ID);
    await app.close();
  });

  it('creates new user when no existing user', async () => {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    let insertCallN = 0;
    const mockDb = {
      insert: vi.fn(() => {
        insertCallN++;
        const callN = insertCallN;
        return {
          values: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue(callN === 1 ? [{ id: USER_ID }] : [{ id: DEPOSIT_ID }]),
          }),
        };
      }),
      query: {
        users: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    };
    app.decorate('db', mockDb as never);
    const { default: devSeedRoutes } = await import('../routes/dev-seed.routes.js');
    await app.register(devSeedRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/dev/seed/deposit',
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    // Two inserts: user + deposit
    expect(insertCallN).toBe(2);
    await app.close();
  });

  it('accepts status=credited', async () => {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.decorate('db', {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: DEPOSIT_ID }]),
        }),
      }),
      query: { users: { findFirst: vi.fn().mockResolvedValue({ id: USER_ID }) } },
    } as never);
    const { default: devSeedRoutes } = await import('../routes/dev-seed.routes.js');
    await app.register(devSeedRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/dev/seed/deposit',
      payload: { status: 'credited', chain: 'sol', token: 'USDC' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('returns 400 for invalid chain', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/dev/seed/deposit',
      payload: { chain: 'eth' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: production guard ───────────────────────────────────────────────────

describe('production guard', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'test';
    vi.restoreAllMocks();
  });

  it('calls process.exit(1) when NODE_ENV=production', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    process.env.NODE_ENV = 'production';

    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.decorate('db', {} as never);

    const { default: devSeedRoutes } = await import('../routes/dev-seed.routes.js');
    await app.register(devSeedRoutes);
    await app.ready();

    expect(exitSpy).toHaveBeenCalledWith(1);
    await app.close();
  });
});
