import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for dashboard.routes.ts
// Tests: GET /dashboard/metrics, GET /dashboard/nav-counts, GET /dashboard/history
// Uses Fastify inject + mocked DB + dashboard-history service
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/dashboard-history.service.js', () => ({
  getDashboardHistory: vi.fn(),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';

// Each select() call in dashboard.routes.ts returns { cnt, total? } rows.
// GET /dashboard/metrics makes 7 select() calls:
//   1. pendingDepositStats (cnt + total)
//   2. pendingWithdrawalStats (cnt)
//   3. pendingMultisigStats (cnt)
//   4-7. AUM breakdown (4 × USDT/USDC × BNB/SOL) via Promise.all
// GET /dashboard/nav-counts makes 5 select() calls via Promise.all (each ends with .then(cb))

function makeCountMock(cnt: number, total?: string) {
  const row = total !== undefined ? { cnt, total } : { cnt };
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([row]),
    }),
  };
}

function makeThenCountMock(cnt: number) {
  // nav-counts uses .select().from().where().then(cb) — .where() must return a real Promise
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ cnt }]),
    }),
  };
}

async function buildApp(
  opts: {
    historyFn?: (...args: unknown[]) => Promise<unknown>;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // select() call counter — dispatches based on position within the handler
  let metricCallN = 0;
  const mockSelect = vi.fn(() => {
    metricCallN++;
    switch (metricCallN) {
      case 1:
        // pendingDepositStats
        return makeCountMock(3, '15000.00');
      case 2:
        // pendingWithdrawalStats
        return makeCountMock(2);
      case 3:
        // pendingMultisigStats
        return makeCountMock(1);
      case 4:
        // AUM usdtBnb
        return makeCountMock(0, '5000.00');
      case 5:
        // AUM usdcBnb
        return makeCountMock(0, '3000.00');
      case 6:
        // AUM usdtSol
        return makeCountMock(0, '4000.00');
      case 7:
        // AUM usdcSol
        return makeCountMock(0, '2000.00');
      // nav-counts: calls 8-12
      default:
        return makeThenCountMock(5);
    }
  });

  app.decorate('db', { select: mockSelect } as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { getDashboardHistory } = await import('../services/dashboard-history.service.js');
  vi.mocked(getDashboardHistory).mockImplementation(
    (opts.historyFn as typeof getDashboardHistory | undefined) ??
      (async (_, metric, range) => ({
        metric,
        range,
        points: [{ t: '2026-01-01T00:00:00Z', v: 1000 }],
      }))
  );

  const { default: dashboardRoutes } = await import('../routes/dashboard.routes.js');
  await app.register(dashboardRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /dashboard/metrics ────────────────────────────────────────────

describe('GET /dashboard/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregated metrics', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/dashboard/metrics' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pendingDeposits).toBe(3);
    expect(body.pendingWithdrawals).toBe(2);
    expect(body.pendingMultisigOps).toBe(1);
    expect(body.aumBreakdown).toBeDefined();
    expect(body.aumBreakdown.usdtBnb).toBe('5000.00');
    await app.close();
  });

  it('returns AUM totals as summed strings', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/dashboard/metrics' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // aumUsdt = usdtBnb(5000) + usdtSol(4000) = 9000
    expect(body.aumUsdt).toBe('9000');
    // aumUsdc = usdcBnb(3000) + usdcSol(2000) = 5000
    expect(body.aumUsdc).toBe('5000');
    await app.close();
  });

  it('returns null for block sync fields', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/dashboard/metrics' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.blockSyncBnb).toBeNull();
    expect(body.blockSyncSol).toBeNull();
    await app.close();
  });
});

// ── Tests: GET /dashboard/nav-counts ─────────────────────────────────────────

describe('GET /dashboard/nav-counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns badge counts for sidebar', async () => {
    // Build fresh app so metricCallN starts at 0 — nav-counts uses calls 1-5
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ cnt: 7 }]),
      }),
    });

    app.decorate('db', { select: mockSelect } as never);
    app.addHook('preHandler', async (req) => {
      req.session = { staff: { id: STAFF_ID, role: 'admin' } } as unknown as typeof req.session;
    });

    const { getDashboardHistory } = await import('../services/dashboard-history.service.js');
    vi.mocked(getDashboardHistory).mockResolvedValue({ metric: 'aum', range: '24h', points: [] });

    const { default: dashboardRoutes } = await import('../routes/dashboard.routes.js');
    await app.register(dashboardRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/dashboard/nav-counts' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.deposits).toBe('number');
    expect(typeof body.sweep).toBe('number');
    expect(typeof body.withdrawals).toBe('number');
    expect(typeof body.multisig).toBe('number');
    expect(typeof body.recovery).toBe('number');
    await app.close();
  });
});

// ── Tests: GET /dashboard/history ────────────────────────────────────────────

describe('GET /dashboard/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns history points for aum/24h', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/history?metric=aum&range=24h',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.metric).toBe('aum');
    expect(body.range).toBe('24h');
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points[0]).toHaveProperty('t');
    expect(body.points[0]).toHaveProperty('v');
    await app.close();
  });

  it('returns history for deposits/7d', async () => {
    const app = await buildApp({
      historyFn: async (_, metric, range) => ({
        metric,
        range,
        points: [{ t: '2026-01-01T00:00:00Z', v: 500 }],
      }),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/history?metric=deposits&range=7d',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.metric).toBe('deposits');
    expect(body.range).toBe('7d');
    await app.close();
  });

  it('returns 400 for invalid metric', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/history?metric=unknown&range=24h',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 for invalid range', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/history?metric=aum&range=1y',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 for missing query params', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/history',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
