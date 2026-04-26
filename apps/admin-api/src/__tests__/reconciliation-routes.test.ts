import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for reconciliation.routes.ts
// Tests: POST /reconciliation/run, GET /reconciliation/snapshots,
//        GET /reconciliation/snapshots/:id, POST /reconciliation/snapshots/:id/cancel
// Guards: RECON_ENABLED=false → 503 on all routes
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const SNAPSHOT_ID = '00000000-0000-0000-0000-000000000002';

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: SNAPSHOT_ID,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    triggeredBy: STAFF_ID,
    status: 'completed' as const,
    chain: 'bnb' as const,
    scope: 'all' as const,
    onChainTotalMinor: 100_000_000n,
    ledgerTotalMinor: 100_000_000n,
    driftTotalMinor: 0n,
    errorMessage: null,
    completedAt: new Date('2026-01-15T10:05:00Z'),
    ...overrides,
  };
}

function makeDrift(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    snapshotId: SNAPSHOT_ID,
    chain: 'bnb' as const,
    token: 'USDT' as const,
    address: '0xHotWallet',
    accountLabel: 'hot-bnb',
    onChainMinor: 100_000_000n,
    ledgerMinor: 100_000_000n,
    driftMinor: 0n,
    severity: 'info' as const,
    suppressedReason: null,
    createdAt: new Date('2026-01-15T10:05:00Z'),
    ...overrides,
  };
}

function makeBaseApp() {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });
  return app;
}

// Build app specifically for POST /reconciliation/run
async function buildRunApp(opts: {
  existingRun?: { id: string } | null;
  jobId?: string;
  reconEnabled?: boolean;
}) {
  if (opts.reconEnabled === false) {
    process.env.RECON_ENABLED = 'false';
  } else {
    process.env.RECON_ENABLED = 'true';
  }

  const app = makeBaseApp();
  const existingRun = opts.existingRun === undefined ? null : opts.existingRun;

  // Idempotency check: select({id}).from().where().limit(1)
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(existingRun ? [existingRun] : []),
      }),
    }),
  });

  const mockReconQueue = {
    add: vi.fn().mockResolvedValue({ id: opts.jobId ?? 'job-123' }),
  };

  app.decorate('db', { select: mockSelect } as never);
  app.decorate('reconQueue', mockReconQueue as never);

  const { default: reconciliationRoutes } = await import('../routes/reconciliation.routes.js');
  await app.register(reconciliationRoutes);
  await app.ready();
  return { app, mockReconQueue };
}

// Build app for GET /reconciliation/snapshots
async function buildListApp(opts: {
  snapshots?: ReturnType<typeof makeSnapshot>[];
  totalCount?: number;
  reconEnabled?: boolean;
}) {
  if (opts.reconEnabled === false) {
    process.env.RECON_ENABLED = 'false';
  } else {
    process.env.RECON_ENABLED = 'true';
  }

  const app = makeBaseApp();
  const snapshots = opts.snapshots ?? [makeSnapshot()];
  const totalCount = opts.totalCount ?? snapshots.length;

  // Two select calls: list then count
  let selectCallN = 0;
  const mockSelect = vi.fn(() => {
    selectCallN++;
    if (selectCallN === 1) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(snapshots),
              }),
            }),
          }),
        }),
      };
    }
    // Count query
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: totalCount }]),
      }),
    };
  });

  app.decorate('db', { select: mockSelect } as never);
  app.decorate('reconQueue', { add: vi.fn() } as never);

  const { default: reconciliationRoutes } = await import('../routes/reconciliation.routes.js');
  await app.register(reconciliationRoutes);
  await app.ready();
  return app;
}

// Build app for GET /reconciliation/snapshots/:id
async function buildDetailApp(opts: {
  findFirstSnapshot?: ReturnType<typeof makeSnapshot> | null;
  drifts?: ReturnType<typeof makeDrift>[];
}) {
  process.env.RECON_ENABLED = 'true';
  const app = makeBaseApp();
  const findFirstSnapshot =
    opts.findFirstSnapshot === undefined ? makeSnapshot() : opts.findFirstSnapshot;
  const drifts = opts.drifts ?? [makeDrift()];

  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(drifts),
      }),
    }),
  });

  app.decorate('db', {
    select: mockSelect,
    query: {
      reconciliationSnapshots: {
        findFirst: vi.fn().mockResolvedValue(findFirstSnapshot),
      },
    },
  } as never);
  app.decorate('reconQueue', { add: vi.fn() } as never);

  const { default: reconciliationRoutes } = await import('../routes/reconciliation.routes.js');
  await app.register(reconciliationRoutes);
  await app.ready();
  return app;
}

// Build app for POST /reconciliation/snapshots/:id/cancel
async function buildCancelApp(opts: {
  findFirstSnapshot?: ReturnType<typeof makeSnapshot> | null;
}) {
  process.env.RECON_ENABLED = 'true';
  const app = makeBaseApp();
  const findFirstSnapshot =
    opts.findFirstSnapshot === undefined
      ? makeSnapshot({ status: 'running' })
      : opts.findFirstSnapshot;

  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });

  app.decorate('db', {
    select: vi.fn(),
    update: mockUpdate,
    query: {
      reconciliationSnapshots: {
        findFirst: vi.fn().mockResolvedValue(findFirstSnapshot),
      },
    },
  } as never);
  app.decorate('reconQueue', { add: vi.fn() } as never);

  const { default: reconciliationRoutes } = await import('../routes/reconciliation.routes.js');
  await app.register(reconciliationRoutes);
  await app.ready();
  return app;
}

// ── Tests: RECON_ENABLED guard ────────────────────────────────────────────────

describe('RECON_ENABLED=false guard', () => {
  afterEach(() => {
    process.env.RECON_ENABLED = 'true';
    vi.clearAllMocks();
  });

  it('returns 503 on GET /reconciliation/snapshots when disabled', async () => {
    const app = await buildListApp({ reconEnabled: false });
    const res = await app.inject({ method: 'GET', url: '/reconciliation/snapshots' });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe('RECON_DISABLED');
    await app.close();
  });

  it('returns 503 on POST /reconciliation/run when disabled', async () => {
    const { app } = await buildRunApp({ reconEnabled: false });
    const res = await app.inject({ method: 'POST', url: '/reconciliation/run', payload: {} });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ── Tests: POST /reconciliation/run ──────────────────────────────────────────

describe('POST /reconciliation/run', () => {
  beforeEach(() => {
    process.env.RECON_ENABLED = 'true';
    vi.clearAllMocks();
  });

  it('enqueues job and returns 202 with jobId', async () => {
    const { app, mockReconQueue } = await buildRunApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/reconciliation/run',
      payload: {},
    });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBe('job-123');
    expect(body.message).toContain('enqueued');
    expect(mockReconQueue.add).toHaveBeenCalledWith(
      'recon-manual',
      expect.any(Object),
      expect.any(Object)
    );
    await app.close();
  });

  it('accepts optional chain and scope in payload', async () => {
    const { app, mockReconQueue } = await buildRunApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/reconciliation/run',
      payload: { chain: 'bnb', scope: 'all' },
    });
    expect(res.statusCode).toBe(202);
    const jobData = mockReconQueue.add.mock.calls[0][1];
    expect(jobData.chain).toBe('bnb');
    expect(jobData.scope).toBe('all');
    await app.close();
  });

  it('returns 409 when another run is already active', async () => {
    const { app } = await buildRunApp({ existingRun: { id: SNAPSHOT_ID } });
    const res = await app.inject({
      method: 'POST',
      url: '/reconciliation/run',
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('RECON_ALREADY_RUNNING');
    expect(body.snapshotId).toBe(SNAPSHOT_ID);
    await app.close();
  });
});

// ── Tests: GET /reconciliation/snapshots ─────────────────────────────────────

describe('GET /reconciliation/snapshots', () => {
  beforeEach(() => {
    process.env.RECON_ENABLED = 'true';
    vi.clearAllMocks();
  });

  it('returns paginated snapshot list', async () => {
    const app = await buildListApp({});
    const res = await app.inject({ method: 'GET', url: '/reconciliation/snapshots' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].id).toBe(SNAPSHOT_ID);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    await app.close();
  });

  it('serialises dates to ISO strings', async () => {
    const app = await buildListApp({});
    const res = await app.inject({ method: 'GET', url: '/reconciliation/snapshots' });
    const body = JSON.parse(res.body);
    expect(body.data[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data[0].completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });

  it('serialises BigInt totals to strings', async () => {
    const app = await buildListApp({});
    const res = await app.inject({ method: 'GET', url: '/reconciliation/snapshots' });
    const body = JSON.parse(res.body);
    expect(typeof body.data[0].onChainTotalMinor).toBe('string');
    expect(typeof body.data[0].ledgerTotalMinor).toBe('string');
    await app.close();
  });

  it('returns empty list when no snapshots', async () => {
    const app = await buildListApp({ snapshots: [], totalCount: 0 });
    const res = await app.inject({ method: 'GET', url: '/reconciliation/snapshots' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual([]);
    await app.close();
  });

  it('accepts page and limit query params', async () => {
    const app = await buildListApp({});
    const res = await app.inject({
      method: 'GET',
      url: '/reconciliation/snapshots?page=2&limit=10',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).page).toBe(2);
    await app.close();
  });
});

// ── Tests: GET /reconciliation/snapshots/:id ─────────────────────────────────

describe('GET /reconciliation/snapshots/:id', () => {
  beforeEach(() => {
    process.env.RECON_ENABLED = 'true';
    vi.clearAllMocks();
  });

  it('returns snapshot with drift rows', async () => {
    const app = await buildDetailApp({});
    const res = await app.inject({
      method: 'GET',
      url: `/reconciliation/snapshots/${SNAPSHOT_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.snapshot.id).toBe(SNAPSHOT_ID);
    expect(Array.isArray(body.drifts)).toBe(true);
    expect(body.drifts[0].snapshotId).toBe(SNAPSHOT_ID);
    await app.close();
  });

  it('returns 404 when snapshot not found', async () => {
    const app = await buildDetailApp({ findFirstSnapshot: null });
    const res = await app.inject({
      method: 'GET',
      url: `/reconciliation/snapshots/${SNAPSHOT_ID}`,
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 400 for non-uuid id', async () => {
    const app = await buildDetailApp({});
    const res = await app.inject({
      method: 'GET',
      url: '/reconciliation/snapshots/not-a-uuid',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: POST /reconciliation/snapshots/:id/cancel ─────────────────────────

describe('POST /reconciliation/snapshots/:id/cancel', () => {
  beforeEach(() => {
    process.env.RECON_ENABLED = 'true';
    vi.clearAllMocks();
  });

  it('cancels a running snapshot and returns ok', async () => {
    const app = await buildCancelApp({});
    const res = await app.inject({
      method: 'POST',
      url: `/reconciliation/snapshots/${SNAPSHOT_ID}/cancel`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    await app.close();
  });

  it('returns 404 when snapshot not found', async () => {
    const app = await buildCancelApp({ findFirstSnapshot: null });
    const res = await app.inject({
      method: 'POST',
      url: `/reconciliation/snapshots/${SNAPSHOT_ID}/cancel`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 409 when snapshot is not running', async () => {
    const app = await buildCancelApp({
      findFirstSnapshot: makeSnapshot({ status: 'completed' }),
    });
    const res = await app.inject({
      method: 'POST',
      url: `/reconciliation/snapshots/${SNAPSHOT_ID}/cancel`,
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('CONFLICT');
    await app.close();
  });

  it('returns 400 for non-uuid id', async () => {
    const app = await buildCancelApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/reconciliation/snapshots/not-a-uuid/cancel',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
