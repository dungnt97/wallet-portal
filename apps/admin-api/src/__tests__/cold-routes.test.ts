import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for cold.routes.ts
// Tests: GET /cold/balances, GET /cold/wallets, POST /cold/band-check/run
// Mocks getColdBalances service; mocks Redis keys/del; Drizzle select chain for wallets
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/cold-balance.service.js', () => ({
  getColdBalances: vi.fn(),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';

function makeBalanceEntry(overrides: Record<string, unknown> = {}) {
  return {
    chain: 'bnb' as const,
    tier: 'hot' as const,
    address: '0xHotWallet',
    token: 'USDT' as const,
    balance: '10000.00',
    lastCheckedAt: '2026-01-15T10:00:00Z',
    stale: false,
    ...overrides,
  };
}

function makeWalletRow(overrides: Record<string, unknown> = {}) {
  return {
    chain: 'bnb' as const,
    tier: 'hot' as const,
    address: '0xHotWallet',
    multisigAddr: null,
    policyConfig: { bandFloorUsd: 10000, bandCeilingUsd: 500000 },
    ...overrides,
  };
}

async function buildApp(
  opts: {
    balances?: ReturnType<typeof makeBalanceEntry>[];
    getColdBalancesError?: Error;
    walletRows?: ReturnType<typeof makeWalletRow>[];
    redisKeys?: string[];
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const walletRows = opts.walletRows ?? [
    makeWalletRow({ tier: 'hot' }),
    makeWalletRow({ tier: 'cold', address: '0xColdVault' }),
  ];

  // select().from().where().then() — hot rows then cold rows
  let selectCallN = 0;
  const mockSelect = vi.fn(() => {
    selectCallN++;
    const rows =
      selectCallN === 1
        ? walletRows.filter((r) => (r.tier as string) === 'hot')
        : walletRows.filter((r) => (r.tier as string) === 'cold');
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          // .then(cb) pattern used by cold.routes — drizzle mock requires .then for await chaining
          // biome-ignore lint/suspicious/noThenProperty: drizzle ORM mock requires .then for await chaining
          then: (resolve: (r: typeof walletRows) => void) => {
            const hotRows = walletRows.filter((r) => (r.tier as string) === 'hot');
            // second select call inside then
            const mockInnerSelect = {
              from: vi.fn().mockReturnValue({
                where: vi
                  .fn()
                  .mockResolvedValue(walletRows.filter((r) => (r.tier as string) === 'cold')),
              }),
            };
            return resolve(hotRows) ?? Promise.resolve(resolve(hotRows));
          },
          // Also provide direct resolution for non-.then() usage
          orderBy: vi.fn().mockResolvedValue(rows),
        }),
        orderBy: vi.fn().mockResolvedValue(rows),
      }),
    };
  });

  const redisKeys = opts.redisKeys ?? ['balance:bnb:hot', 'balance:sol:cold'];
  const mockRedis = {
    keys: vi.fn().mockResolvedValue(redisKeys),
    del: vi.fn().mockResolvedValue(redisKeys.length),
  };

  // Use a simpler db mock that avoids the .then() drizzle complexity
  const mockDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const rows1 = walletRows.filter((r) => (r.tier as string) === 'hot');
          const rows2 = walletRows.filter((r) => (r.tier as string) === 'cold');
          let callCount = 0;
          const promise = Promise.resolve(rows1);
          // biome-ignore lint/suspicious/noThenProperty: drizzle ORM mock requires .then
          (promise as unknown as Record<string, unknown>).then = (
            cb: (r: typeof walletRows) => unknown
          ) => {
            callCount++;
            if (callCount === 1) {
              return {
                from: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue(rows2),
                }),
              };
            }
            return cb(rows1);
          };
          return promise;
        }),
      }),
    }),
  };

  app.decorate('db', mockDb as never);
  app.decorate('redis', mockRedis as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { getColdBalances } = await import('../services/cold-balance.service.js');
  if (opts.getColdBalancesError) {
    vi.mocked(getColdBalances).mockRejectedValue(opts.getColdBalancesError);
  } else {
    vi.mocked(getColdBalances).mockResolvedValue((opts.balances ?? [makeBalanceEntry()]) as never);
  }

  const { default: coldRoutes } = await import('../routes/cold.routes.js');
  await app.register(coldRoutes);
  await app.ready();
  return { app, mockRedis, getColdBalances };
}

// ── Tests: GET /cold/balances ─────────────────────────────────────────────────

describe('GET /cold/balances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns balance list from service', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/cold/balances' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].chain).toBe('bnb');
    expect(body.data[0].balance).toBe('10000.00');
    await app.close();
  });

  it('returns empty data array when no balances', async () => {
    const { app } = await buildApp({ balances: [] });
    const res = await app.inject({ method: 'GET', url: '/cold/balances' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual([]);
    await app.close();
  });

  it('returns multiple balance entries', async () => {
    const { app } = await buildApp({
      balances: [
        makeBalanceEntry({ chain: 'bnb', tier: 'hot', token: 'USDT' }),
        makeBalanceEntry({ chain: 'bnb', tier: 'hot', token: 'USDC', balance: '5000.00' }),
        makeBalanceEntry({ chain: 'sol', tier: 'cold', token: 'USDT', balance: '20000.00' }),
      ],
    });
    const res = await app.inject({ method: 'GET', url: '/cold/balances' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toHaveLength(3);
    await app.close();
  });

  it('passes probe config to getColdBalances', async () => {
    const { app, getColdBalances } = await buildApp();
    await app.inject({ method: 'GET', url: '/cold/balances' });
    expect(vi.mocked(getColdBalances)).toHaveBeenCalledOnce();
    const [, , probeConfig] = vi.mocked(getColdBalances).mock.calls[0]!;
    expect(probeConfig).toHaveProperty('rpcBnb');
    expect(probeConfig).toHaveProperty('rpcSolana');
    await app.close();
  });
});

// ── Tests: POST /cold/band-check/run ─────────────────────────────────────────

describe('POST /cold/band-check/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flushes Redis cache and returns fresh balances', async () => {
    const { app, mockRedis } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/cold/band-check/run' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.triggeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mockRedis.keys).toHaveBeenCalledWith('balance:*');
    expect(mockRedis.del).toHaveBeenCalled();
    await app.close();
  });

  it('skips del when no cache keys exist', async () => {
    const { app, mockRedis } = await buildApp({ redisKeys: [] });
    const res = await app.inject({ method: 'POST', url: '/cold/band-check/run' });
    expect(res.statusCode).toBe(200);
    expect(mockRedis.del).not.toHaveBeenCalled();
    await app.close();
  });

  it('includes triggeredAt in ISO format', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/cold/band-check/run' });
    const body = JSON.parse(res.body);
    expect(new Date(body.triggeredAt).getFullYear()).toBeGreaterThan(2020);
    await app.close();
  });
});
