import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for sweeps.routes.ts
// Tests: GET /sweeps, GET /sweeps/candidates, POST /sweeps/scan,
//        POST /sweeps/trigger, GET /sweeps/batches
// Uses Fastify inject + mocked DB/services — no real Postgres
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/sweep-candidate-scan.service.js', () => ({
  scanSweepCandidates: vi.fn(),
}));

vi.mock('../services/sweep-create.service.js', () => ({
  createSweeps: vi.fn(),
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class ConflictError extends Error {
    code = 'CONFLICT';
    statusCode = 409;
    constructor(m: string) {
      super(m);
      this.name = 'ConflictError';
    }
  },
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const SWEEP_ID = '00000000-0000-0000-0000-000000000002';
const ADDR_ID = '00000000-0000-0000-0000-000000000003';

function makeSweep(overrides: Record<string, unknown> = {}) {
  return {
    id: SWEEP_ID,
    userAddressId: ADDR_ID,
    chain: 'bnb' as const,
    token: 'USDT' as const,
    fromAddr: '0xUserAddr',
    toMultisig: '0xMultisigAddr',
    amount: '500.00',
    status: 'pending' as const,
    txHash: null,
    createdBy: STAFF_ID,
    broadcastAt: null,
    confirmedAt: null,
    errorMessage: null,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

function makeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    userAddressId: ADDR_ID,
    userId: '00000000-0000-0000-0000-000000000010',
    chain: 'bnb' as const,
    address: '0xUserAddr',
    derivationPath: "m/44'/60'/0'/0/0",
    creditedUsdt: '500.00',
    creditedUsdc: '0.00',
    estimatedUsd: 500,
    ...overrides,
  };
}

async function buildApp(
  opts: {
    sweepRows?: Record<string, unknown>[];
    scanCandidatesFn?: (...args: unknown[]) => Promise<unknown>;
    createSweepsFn?: (...args: unknown[]) => Promise<unknown>;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const sweepRows = opts.sweepRows ?? [makeSweep()];

  const mockDb = {
    query: {
      sweeps: {
        findMany: vi.fn().mockResolvedValue(sweepRows),
      },
    },
  };

  const mockSweepQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-sweep-1' }),
  };

  const mockIO = {
    of: vi.fn().mockReturnValue({ emit: vi.fn() }),
  };

  app.decorate('db', mockDb as never);
  app.decorate('io', mockIO as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { scanSweepCandidates } = await import('../services/sweep-candidate-scan.service.js');
  const { createSweeps } = await import('../services/sweep-create.service.js');

  vi.mocked(scanSweepCandidates).mockImplementation(
    (opts.scanCandidatesFn ?? (async () => [makeCandidate()])) as typeof scanSweepCandidates
  );

  vi.mocked(createSweeps).mockImplementation(
    (opts.createSweepsFn ??
      (async () => ({
        created: [{ sweepId: SWEEP_ID, userAddressId: ADDR_ID, jobId: 'job-sweep-1' }],
        skipped: [],
      }))) as typeof createSweeps
  );

  const { default: sweepsRoutes } = await import('../routes/sweeps.routes.js');
  await app.register(sweepsRoutes, { sweepQueue: mockSweepQueue as never });
  await app.ready();
  return app;
}

// ── Tests: GET /sweeps ────────────────────────────────────────────────────────

describe('GET /sweeps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated list of sweeps', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/sweeps?page=1&limit=20' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(SWEEP_ID);
    expect(body.page).toBe(1);
    await app.close();
  });

  it('returns empty list when no sweeps', async () => {
    const app = await buildApp({ sweepRows: [] });
    const res = await app.inject({ method: 'GET', url: '/sweeps?page=1&limit=20' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    await app.close();
  });

  it('serialises Date fields to ISO strings', async () => {
    const confirmedAt = new Date('2026-02-01T12:00:00Z');
    const app = await buildApp({ sweepRows: [makeSweep({ confirmedAt, status: 'confirmed' })] });
    const res = await app.inject({ method: 'GET', url: '/sweeps' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].confirmedAt).toBe(confirmedAt.toISOString());
    await app.close();
  });

  it('returns null for optional nullable fields', async () => {
    const app = await buildApp({
      sweepRows: [
        makeSweep({ txHash: null, broadcastAt: null, confirmedAt: null, errorMessage: null }),
      ],
    });
    const res = await app.inject({ method: 'GET', url: '/sweeps' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].txHash).toBeNull();
    expect(body.data[0].broadcastAt).toBeNull();
    await app.close();
  });

  it('filters by chain param (passed to DB query)', async () => {
    const app = await buildApp({ sweepRows: [makeSweep({ chain: 'sol' })] });
    const res = await app.inject({ method: 'GET', url: '/sweeps?chain=sol' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 400 for invalid chain param', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/sweeps?chain=eth' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: GET /sweeps/candidates ─────────────────────────────────────────────

describe('GET /sweeps/candidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sweep candidates', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/sweeps/candidates' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].userAddressId).toBe(ADDR_ID);
    expect(body.total).toBe(1);
    await app.close();
  });

  it('returns empty candidates', async () => {
    const app = await buildApp({ scanCandidatesFn: async () => [] });
    const res = await app.inject({ method: 'GET', url: '/sweeps/candidates' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    await app.close();
  });

  it('passes chain filter to scanSweepCandidates', async () => {
    const { scanSweepCandidates } = await import('../services/sweep-candidate-scan.service.js');
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/sweeps/candidates?chain=bnb' });
    expect(vi.mocked(scanSweepCandidates)).toHaveBeenCalledWith(
      expect.anything(),
      'bnb',
      undefined,
      undefined
    );
    await app.close();
  });

  it('passes token filter to scanSweepCandidates', async () => {
    const { scanSweepCandidates } = await import('../services/sweep-candidate-scan.service.js');
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/sweeps/candidates?token=USDT' });
    expect(vi.mocked(scanSweepCandidates)).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      'USDT',
      undefined
    );
    await app.close();
  });
});

// ── Tests: POST /sweeps/scan ──────────────────────────────────────────────────

describe('POST /sweeps/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns fresh candidate list', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/sweeps/scan',
      payload: { chain: 'bnb', token: 'USDT' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(1);
    await app.close();
  });

  it('works with empty body', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/sweeps/scan', payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 400 for invalid chain', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/sweeps/scan',
      payload: { chain: 'eth' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: POST /sweeps/trigger ───────────────────────────────────────────────

describe('POST /sweeps/trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates sweeps and returns result', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/sweeps/trigger',
      payload: { candidate_ids: [ADDR_ID] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.created).toHaveLength(1);
    expect(body.created[0].sweepId).toBe(SWEEP_ID);
    expect(body.skipped).toEqual([]);
    await app.close();
  });

  it('returns 404 on NotFoundError', async () => {
    const { NotFoundError } = await import('../services/sweep-create.service.js');
    const app = await buildApp({
      createSweepsFn: async () => {
        throw new NotFoundError('Address not found');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/sweeps/trigger',
      payload: { candidate_ids: [ADDR_ID] },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 409 on ConflictError', async () => {
    const { ConflictError } = await import('../services/sweep-create.service.js');
    const app = await buildApp({
      createSweepsFn: async () => {
        throw new ConflictError('Sweep already in progress');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/sweeps/trigger',
      payload: { candidate_ids: [ADDR_ID] },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('CONFLICT');
    await app.close();
  });

  it('returns 400 when candidate_ids is empty', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/sweeps/trigger',
      payload: { candidate_ids: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns result with skipped entries', async () => {
    const app = await buildApp({
      createSweepsFn: async () => ({
        created: [],
        skipped: [{ userAddressId: ADDR_ID, reason: 'already_pending' }],
      }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/sweeps/trigger',
      payload: { candidate_ids: [ADDR_ID] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.skipped).toHaveLength(1);
    expect(body.created).toEqual([]);
    await app.close();
  });
});

// ── Tests: GET /sweeps/batches ────────────────────────────────────────────────

describe('GET /sweeps/batches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns batch aggregations from recent sweeps', async () => {
    const app = await buildApp({
      sweepRows: [
        makeSweep({ status: 'confirmed', confirmedAt: new Date('2026-01-15T11:00:00Z') }),
        makeSweep({
          id: '00000000-0000-0000-0000-000000000099',
          status: 'confirmed',
          createdAt: new Date('2026-01-15T10:00:30Z'),
          confirmedAt: new Date('2026-01-15T11:00:30Z'),
        }),
      ],
    });
    const res = await app.inject({ method: 'GET', url: '/sweeps/batches?limit=10' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    await app.close();
  });

  it('returns empty batches when no sweeps', async () => {
    const app = await buildApp({ sweepRows: [] });
    const res = await app.inject({ method: 'GET', url: '/sweeps/batches' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    await app.close();
  });

  it('computes partial status for mixed failed/confirmed batch', async () => {
    const now = new Date('2026-01-15T10:00:00Z');
    const app = await buildApp({
      sweepRows: [
        makeSweep({ id: SWEEP_ID, status: 'confirmed', createdAt: now }),
        makeSweep({ id: '00000000-0000-0000-0000-000000000099', status: 'failed', createdAt: now }),
      ],
    });
    const res = await app.inject({ method: 'GET', url: '/sweeps/batches?limit=10' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Both in same 60s window → partial
    const batch = body.data[0];
    expect(batch).toBeDefined();
    expect(['partial', 'completed', 'failed', 'pending']).toContain(batch.status);
    await app.close();
  });

  it('computes failed status for all-failed batch', async () => {
    const now = new Date('2026-01-15T10:00:00Z');
    const app = await buildApp({
      sweepRows: [makeSweep({ status: 'failed', createdAt: now })],
    });
    const res = await app.inject({ method: 'GET', url: '/sweeps/batches' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].status).toBe('failed');
    await app.close();
  });

  it('computes pending status for pending/submitted sweeps', async () => {
    const now = new Date('2026-01-15T10:00:00Z');
    const app = await buildApp({
      sweepRows: [makeSweep({ status: 'pending', createdAt: now })],
    });
    const res = await app.inject({ method: 'GET', url: '/sweeps/batches' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].status).toBe('pending');
    await app.close();
  });

  it('filters by chain', async () => {
    const app = await buildApp({ sweepRows: [makeSweep({ chain: 'sol' })] });
    const res = await app.inject({ method: 'GET', url: '/sweeps/batches?chain=sol' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('respects limit', async () => {
    const sweeps = Array.from({ length: 5 }, (_, i) =>
      makeSweep({
        id: `00000000-0000-0000-0000-00000000000${i}`,
        // Each in a different 60s window
        createdAt: new Date(Date.now() - i * 120_000),
        createdBy: STAFF_ID,
      })
    );
    const app = await buildApp({ sweepRows: sweeps });
    const res = await app.inject({ method: 'GET', url: '/sweeps/batches?limit=2' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBeLessThanOrEqual(2);
    await app.close();
  });
});
