import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for transactions.routes.ts
// Tests: GET /transactions — pagination, chain/status/type/token/date filters,
//        inferTxType logic (deposit/sweep/withdrawal classification)
// Uses Fastify inject + mocked DB — no real Postgres
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const TX_ID = '00000000-0000-0000-0000-000000000002';

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: TX_ID,
    chain: 'bnb' as const,
    token: 'USDT' as const,
    amount: '1000.00',
    fromAddr: 'external',
    toAddr: '0xUserAddress',
    hash: '0xabc123',
    blockNumber: 12345678n,
    status: 'confirmed' as const,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

async function buildApp(
  opts: {
    txRows?: Record<string, unknown>[];
    txCount?: number;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const txRows = opts.txRows ?? [makeTx()];
  const txCount = opts.txCount ?? txRows.length;

  // Drizzle chainable mock — handles both list query and count query.
  // The route calls Promise.all([listQuery, countQuery.then(r => r[0]?.count ?? 0)]).
  // The count sub-query ends with .where().then(cb) — we make .where() return a real Promise
  // so the native .then() on the Promise works (not a thenable object property).
  let selectCall = 0;
  const mockSelect = vi.fn(() => {
    selectCall++;
    if (selectCall % 2 === 0) {
      // Even call = count query — .where() returns a real resolved Promise
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: txCount }]),
        }),
      };
    }
    // Odd call = list query
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(txRows),
            }),
          }),
        }),
      }),
    };
  });

  const mockDb = { select: mockSelect };

  app.decorate('db', mockDb as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { default: transactionsRoutes } = await import('../routes/transactions.routes.js');
  await app.register(transactionsRoutes);
  await app.ready();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /transactions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated transaction list', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/transactions?page=1&limit=25' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(TX_ID);
    expect(body.page).toBe(1);
    await app.close();
  });

  it('infers deposit type from external fromAddr', async () => {
    const app = await buildApp({ txRows: [makeTx({ fromAddr: 'external' })] });
    const res = await app.inject({ method: 'GET', url: '/transactions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].type).toBe('deposit');
    await app.close();
  });

  it('infers sweep type from hot_safe toAddr', async () => {
    const app = await buildApp({
      txRows: [makeTx({ fromAddr: '0xUserAddr', toAddr: 'hot_safe' })],
    });
    const res = await app.inject({ method: 'GET', url: '/transactions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].type).toBe('sweep');
    await app.close();
  });

  it('infers withdrawal type from user-to-external pattern', async () => {
    const app = await buildApp({
      txRows: [makeTx({ fromAddr: '0xHotSafe', toAddr: '0xExternal' })],
    });
    const res = await app.inject({ method: 'GET', url: '/transactions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].type).toBe('withdrawal');
    await app.close();
  });

  it('maps dropped status to failed', async () => {
    const app = await buildApp({ txRows: [makeTx({ status: 'dropped' })] });
    const res = await app.inject({ method: 'GET', url: '/transactions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].status).toBe('failed');
    await app.close();
  });

  it('filters by type client-side', async () => {
    const rows = [
      makeTx({ id: TX_ID, fromAddr: 'external' }),
      makeTx({ id: '00000000-0000-0000-0000-000000000099', fromAddr: '0xA', toAddr: 'hot_safe' }),
    ];
    const app = await buildApp({ txRows: rows });
    const res = await app.inject({ method: 'GET', url: '/transactions?type=deposit' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.every((d: { type: string }) => d.type === 'deposit')).toBe(true);
    await app.close();
  });

  it('returns empty data when no transactions', async () => {
    const app = await buildApp({ txRows: [], txCount: 0 });
    const res = await app.inject({ method: 'GET', url: '/transactions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    await app.close();
  });

  it('passes chain filter in query', async () => {
    const app = await buildApp({ txRows: [makeTx({ chain: 'sol' })] });
    const res = await app.inject({ method: 'GET', url: '/transactions?chain=sol' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].chain).toBe('sol');
    await app.close();
  });

  it('passes token filter in query', async () => {
    const app = await buildApp({ txRows: [makeTx({ token: 'USDC' })] });
    const res = await app.inject({ method: 'GET', url: '/transactions?token=USDC' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].token).toBe('USDC');
    await app.close();
  });

  it('passes status filter in query', async () => {
    const app = await buildApp({ txRows: [makeTx({ status: 'pending' })] });
    const res = await app.inject({ method: 'GET', url: '/transactions?status=pending' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('passes date range filters in query', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/transactions?dateFrom=2026-01-01T00:00:00Z&dateTo=2026-12-31T23:59:59Z',
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 400 for invalid chain filter', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/transactions?chain=eth' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('converts blockNumber BigInt to number', async () => {
    const app = await buildApp({ txRows: [makeTx({ blockNumber: 99999999n })] });
    const res = await app.inject({ method: 'GET', url: '/transactions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].blockNumber).toBe(99999999);
    await app.close();
  });

  it('returns 0 blockNumber when null', async () => {
    const app = await buildApp({ txRows: [makeTx({ blockNumber: null })] });
    const res = await app.inject({ method: 'GET', url: '/transactions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].blockNumber).toBe(0);
    await app.close();
  });
});
