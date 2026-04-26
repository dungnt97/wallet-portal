import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for signers.routes.ts
// Tests: GET /signers/stats, POST /signers/add, POST /signers/remove,
//        POST /signers/rotate, GET /signers/ceremonies, GET /signers/ceremonies/:id,
//        POST /signers/ceremonies/:id/cancel
// Uses Fastify inject + mocked DB/services — no real Postgres
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/signer-add.service.js', () => ({
  addSigner: vi.fn(),
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  ValidationError: class ValidationError extends Error {
    code = 'VALIDATION_ERROR';
    constructor(m: string) {
      super(m);
      this.name = 'ValidationError';
    }
  },
}));

vi.mock('../services/signer-remove.service.js', () => ({
  removeSigner: vi.fn(),
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  ValidationError: class ValidationError extends Error {
    code = 'VALIDATION_ERROR';
    constructor(m: string) {
      super(m);
      this.name = 'ValidationError';
    }
  },
}));

vi.mock('../services/signer-rotate.service.js', () => ({
  rotateSigners: vi.fn(),
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  ValidationError: class ValidationError extends Error {
    code = 'VALIDATION_ERROR';
    constructor(m: string) {
      super(m);
      this.name = 'ValidationError';
    }
  },
}));

vi.mock('../services/signer-ceremony-cancel.service.js', () => ({
  cancelCeremony: vi.fn(),
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class ConflictError extends Error {
    code = 'CONFLICT';
    constructor(m: string) {
      super(m);
      this.name = 'ConflictError';
    }
  },
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_STAFF_ID = '00000000-0000-0000-0000-000000000002';
const CEREMONY_ID = '00000000-0000-0000-0000-000000000003';
const BNB_OP_ID = '00000000-0000-0000-0000-000000000004';
const SOL_OP_ID = '00000000-0000-0000-0000-000000000005';

function makeCeremony(overrides: Record<string, unknown> = {}) {
  return {
    id: CEREMONY_ID,
    operationType: 'signer_add' as const,
    initiatedBy: STAFF_ID,
    targetAdd: [TARGET_STAFF_ID],
    targetRemove: [] as string[],
    chainStates: {},
    status: 'pending' as const,
    reason: null,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

function makeTreasurerStaff(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_STAFF_ID,
    email: 'treasurer@example.com',
    name: 'Treasurer User',
    role: 'treasurer' as const,
    status: 'active' as const,
    lastLoginAt: new Date('2026-01-10T08:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

async function buildApp(
  opts: {
    ceremonyById?: Record<string, unknown> | null;
    ceremonyRows?: Record<string, unknown>[];
    allCeremonyRows?: Record<string, unknown>[];
    staffRows?: Record<string, unknown>[];
    sigCountRows?: Array<{ staffId: string; cnt: number }>;
    keyRows?: Record<string, unknown>[];
    lastActiveRows?: Array<{ staffId: string; lastAt: string }>;
    addSignerFn?: (...args: unknown[]) => Promise<unknown>;
    removeSignerFn?: (...args: unknown[]) => Promise<unknown>;
    rotateSignersFn?: (...args: unknown[]) => Promise<unknown>;
    cancelCeremonyFn?: (...args: unknown[]) => Promise<unknown>;
    // When true, the first 4 select calls (stats) are pre-consumed so ceremonies
    // tests start at call index 1 (not 5) without needing stats calls
    skipStatsPreload?: boolean;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const ceremonyRows = opts.ceremonyRows ?? [makeCeremony()];
  const allCeremonyRows = opts.allCeremonyRows ?? ceremonyRows;
  const staffRows = opts.staffRows ?? [makeTreasurerStaff()];
  const sigCountRows = opts.sigCountRows ?? [{ staffId: TARGET_STAFF_ID, cnt: 5 }];
  const keyRows = opts.keyRows ?? [
    {
      id: '00000000-0000-0000-0000-000000000010',
      staffId: TARGET_STAFF_ID,
      chain: 'bnb',
      address: '0xEvmAddr',
      revokedAt: null,
      registeredAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
    },
  ];
  const lastActiveRows = opts.lastActiveRows ?? [
    { staffId: TARGET_STAFF_ID, lastAt: '2026-01-14T10:00:00.000Z' },
  ];

  // Shared ceremony list + count mock chain (reused regardless of call offset)
  function makeCeremonyListMock() {
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(ceremonyRows),
            }),
          }),
        }),
      }),
    };
  }
  function makeCeremonyCountMock() {
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(allCeremonyRows),
      }),
    };
  }

  // Track select call count to dispatch to the right data.
  // GET /signers/stats calls (in order): staffMembers → sigCounts → keyRows → lastActive
  // GET /signers/ceremonies calls: ceremonies list → ceremonies count
  // When skipStatsPreload=true, the counter starts at 5 so ceremonies calls land at 5 & 6
  // without needing the 4 stats calls. This is used for ceremonies-only tests.
  let callN = opts.skipStatsPreload ? 4 : 0;
  const mockSelect = vi.fn(() => {
    callN++;
    switch (callN) {
      case 1:
        // staffMembers select (stats call 1)
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(staffRows),
          }),
        };
      case 2:
        // sigCounts select (stats call 2)
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue(sigCountRows),
            }),
          }),
        };
      case 3:
        // keyRows select (stats call 3 — no where, just from)
        return {
          from: vi.fn().mockResolvedValue(keyRows),
        };
      case 4:
        // lastActiveRows select (stats call 4)
        return {
          from: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(lastActiveRows),
          }),
        };
      case 5:
        // ceremonies list select
        return makeCeremonyListMock();
      default:
        // ceremonies count select (call 6+)
        return makeCeremonyCountMock();
    }
  });

  const mockDb = {
    query: {
      signerCeremonies: {
        findFirst: vi
          .fn()
          .mockResolvedValue(opts.ceremonyById === undefined ? makeCeremony() : opts.ceremonyById),
      },
    },
    select: mockSelect,
  };

  const mockQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
  const mockIO = { of: vi.fn().mockReturnValue({ emit: vi.fn() }) };
  const mockEmailQueue = { add: vi.fn() };
  const mockSlackQueue = { add: vi.fn() };

  app.decorate('db', mockDb as never);
  app.decorate('io', mockIO as never);
  app.decorate('ceremonyQueue', mockQueue as never);
  app.decorate('emailQueue', mockEmailQueue as never);
  app.decorate('slackQueue', mockSlackQueue as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { addSigner } = await import('../services/signer-add.service.js');
  const { removeSigner } = await import('../services/signer-remove.service.js');
  const { rotateSigners } = await import('../services/signer-rotate.service.js');
  const { cancelCeremony } = await import('../services/signer-ceremony-cancel.service.js');

  vi.mocked(addSigner).mockImplementation(
    opts.addSignerFn ??
      (async () => ({ ceremonyId: CEREMONY_ID, bnbOpId: BNB_OP_ID, solanaOpId: SOL_OP_ID }))
  );

  vi.mocked(removeSigner).mockImplementation(
    opts.removeSignerFn ??
      (async () => ({ ceremonyId: CEREMONY_ID, bnbOpId: BNB_OP_ID, solanaOpId: SOL_OP_ID }))
  );

  vi.mocked(rotateSigners).mockImplementation(
    opts.rotateSignersFn ??
      (async () => ({ ceremonyId: CEREMONY_ID, bnbOpId: BNB_OP_ID, solanaOpId: SOL_OP_ID }))
  );

  vi.mocked(cancelCeremony).mockImplementation(opts.cancelCeremonyFn ?? (async () => undefined));

  const { default: signersRoutes } = await import('../routes/signers.routes.js');
  await app.register(signersRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /signers/stats ─────────────────────────────────────────────────

describe('GET /signers/stats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns signer stats with enriched data', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/signers/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].staffId).toBe(TARGET_STAFF_ID);
    expect(body.data[0].sigCount30d).toBe(5);
    expect(body.data[0].evmAddr).toBe('0xEvmAddr');
    await app.close();
  });

  it('returns empty data when no treasurer staff', async () => {
    const app = await buildApp({ staffRows: [] });
    const res = await app.inject({ method: 'GET', url: '/signers/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    await app.close();
  });

  it('sets sigCount30d=0 when no approvals', async () => {
    const app = await buildApp({ sigCountRows: [] });
    const res = await app.inject({ method: 'GET', url: '/signers/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].sigCount30d).toBe(0);
    await app.close();
  });

  it('sets evmAddr and solAddr to null when no keys', async () => {
    const app = await buildApp({ keyRows: [] });
    const res = await app.inject({ method: 'GET', url: '/signers/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].evmAddr).toBeNull();
    expect(body.data[0].solAddr).toBeNull();
    await app.close();
  });
});

// ── Tests: POST /signers/add ──────────────────────────────────────────────────

describe('POST /signers/add', () => {
  beforeEach(() => vi.clearAllMocks());

  it('initiates signer_add ceremony and returns 201', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/signers/add',
      payload: { targetStaffId: TARGET_STAFF_ID, reason: 'new treasurer onboarding' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.ceremonyId).toBe(CEREMONY_ID);
    expect(body.bnbOpId).toBe(BNB_OP_ID);
    expect(body.solanaOpId).toBe(SOL_OP_ID);
    await app.close();
  });

  it('returns 404 on NotFoundError from addSigner', async () => {
    const { NotFoundError } = await import('../services/signer-add.service.js');
    const app = await buildApp({
      addSignerFn: async () => {
        throw new NotFoundError('staff not found');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/signers/add',
      payload: { targetStaffId: TARGET_STAFF_ID },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 422 on ValidationError from addSigner', async () => {
    const { ValidationError } = await import('../services/signer-add.service.js');
    const app = await buildApp({
      addSignerFn: async () => {
        throw new ValidationError('already a signer');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/signers/add',
      payload: { targetStaffId: TARGET_STAFF_ID },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('returns 400 for invalid targetStaffId', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/signers/add',
      payload: { targetStaffId: 'not-a-uuid' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: POST /signers/remove ───────────────────────────────────────────────

describe('POST /signers/remove', () => {
  beforeEach(() => vi.clearAllMocks());

  it('initiates signer_remove ceremony and returns 201', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/signers/remove',
      payload: { targetStaffId: TARGET_STAFF_ID, reason: 'offboarding' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.ceremonyId).toBe(CEREMONY_ID);
    await app.close();
  });

  it('returns 404 on NotFoundError from removeSigner', async () => {
    const { NotFoundError } = await import('../services/signer-remove.service.js');
    const app = await buildApp({
      removeSignerFn: async () => {
        throw new NotFoundError('signer not found');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/signers/remove',
      payload: { targetStaffId: TARGET_STAFF_ID },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 422 on ValidationError from removeSigner', async () => {
    const { ValidationError } = await import('../services/signer-remove.service.js');
    const app = await buildApp({
      removeSignerFn: async () => {
        throw new ValidationError('below minimum signers');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/signers/remove',
      payload: { targetStaffId: TARGET_STAFF_ID },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

// ── Tests: POST /signers/rotate ───────────────────────────────────────────────

describe('POST /signers/rotate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('initiates signer_rotate ceremony and returns 201', async () => {
    const REMOVE_ID = '00000000-0000-0000-0000-000000000020';
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/signers/rotate',
      payload: {
        addStaffIds: [TARGET_STAFF_ID],
        removeStaffIds: [REMOVE_ID],
        reason: 'annual rotation',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.ceremonyId).toBe(CEREMONY_ID);
    await app.close();
  });

  it('returns 404 on NotFoundError from rotateSigners', async () => {
    const { NotFoundError } = await import('../services/signer-rotate.service.js');
    const app = await buildApp({
      rotateSignersFn: async () => {
        throw new NotFoundError('staff not found');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/signers/rotate',
      payload: {
        addStaffIds: [TARGET_STAFF_ID],
        removeStaffIds: ['00000000-0000-0000-0000-000000000020'],
      },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 400 when addStaffIds is empty', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/signers/rotate',
      payload: { addStaffIds: [], removeStaffIds: [TARGET_STAFF_ID] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: GET /signers/ceremonies ────────────────────────────────────────────

describe('GET /signers/ceremonies', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated ceremony list', async () => {
    const app = await buildApp({ skipStatsPreload: true });
    const res = await app.inject({ method: 'GET', url: '/signers/ceremonies?page=1&limit=20' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(CEREMONY_ID);
    expect(body.page).toBe(1);
    await app.close();
  });

  it('filters by status', async () => {
    const app = await buildApp({ skipStatsPreload: true });
    const res = await app.inject({
      method: 'GET',
      url: '/signers/ceremonies?status=pending',
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 400 for invalid status', async () => {
    const app = await buildApp({ skipStatsPreload: true });
    const res = await app.inject({
      method: 'GET',
      url: '/signers/ceremonies?status=unknown',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('serialises ceremony dates to ISO strings', async () => {
    const app = await buildApp({ skipStatsPreload: true });
    const res = await app.inject({ method: 'GET', url: '/signers/ceremonies' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });
});

// ── Tests: GET /signers/ceremonies/:id ───────────────────────────────────────

describe('GET /signers/ceremonies/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ceremony detail', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/signers/ceremonies/${CEREMONY_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(CEREMONY_ID);
    expect(body.operationType).toBe('signer_add');
    await app.close();
  });

  it('returns 404 when ceremony not found', async () => {
    const app = await buildApp({ ceremonyById: null });
    const res = await app.inject({
      method: 'GET',
      url: `/signers/ceremonies/${CEREMONY_ID}`,
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 400 for non-uuid id', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/signers/ceremonies/not-a-uuid',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: POST /signers/ceremonies/:id/cancel ────────────────────────────────

describe('POST /signers/ceremonies/:id/cancel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels ceremony and returns 204', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/signers/ceremonies/${CEREMONY_ID}/cancel`,
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it('returns 404 when ceremony not found', async () => {
    const { NotFoundError } = await import('../services/signer-ceremony-cancel.service.js');
    const app = await buildApp({
      cancelCeremonyFn: async () => {
        throw new NotFoundError('ceremony not found');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/signers/ceremonies/${CEREMONY_ID}/cancel`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 409 when ceremony already in terminal state', async () => {
    const { ConflictError } = await import('../services/signer-ceremony-cancel.service.js');
    const app = await buildApp({
      cancelCeremonyFn: async () => {
        throw new ConflictError('already confirmed');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/signers/ceremonies/${CEREMONY_ID}/cancel`,
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});
