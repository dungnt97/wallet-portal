import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for chain.routes.ts
// Tests: GET /chain/gas-history, GET /chain/gas-current
// Uses Fastify inject + mocked Redis.zrangebyscore + mocked ethers/solana RPC
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('ethers', () => ({
  JsonRpcProvider: vi.fn().mockImplementation(() => ({
    getFeeData: vi.fn().mockResolvedValue({ gasPrice: 5_000_000_000n, maxFeePerGas: null }),
  })),
}));

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn().mockImplementation(() => ({
    getRecentPrioritizationFees: vi.fn().mockResolvedValue([
      { prioritizationFee: 1000, slot: 1 },
      { prioritizationFee: 2000, slot: 2 },
      { prioritizationFee: 3000, slot: 3 },
    ]),
  })),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';

function makeGasMember(ts: string, price: number): string {
  return JSON.stringify({ ts, price });
}

async function buildApp(
  opts: {
    redisMembers?: string[];
    getFeeDataFn?: () => Promise<{ gasPrice: bigint | null; maxFeePerGas: bigint | null }>;
    solFeesFn?: () => Promise<Array<{ prioritizationFee: number; slot: number }>>;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const redisMembers = opts.redisMembers ?? [
    makeGasMember('2026-01-15T10:00:00Z', 5.0),
    makeGasMember('2026-01-15T11:00:00Z', 5.5),
    makeGasMember('2026-01-15T12:00:00Z', 6.0),
  ];

  const mockRedis = {
    zrangebyscore: vi.fn().mockResolvedValue(redisMembers),
  };

  app.decorate('db', {} as never);
  app.decorate('redis', mockRedis as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  if (opts.getFeeDataFn) {
    const { JsonRpcProvider } = await import('ethers');
    vi.mocked(JsonRpcProvider).mockImplementation(
      () =>
        ({
          getFeeData: opts.getFeeDataFn as () => Promise<{
            gasPrice: bigint | null;
            maxFeePerGas: bigint | null;
          }>,
        }) as never
    );
  }

  if (opts.solFeesFn) {
    const { Connection } = await import('@solana/web3.js');
    vi.mocked(Connection).mockImplementation(
      () =>
        ({
          getRecentPrioritizationFees: opts.solFeesFn as () => Promise<
            Array<{ prioritizationFee: number; slot: number }>
          >,
        }) as never
    );
  }

  const { default: chainRoutes } = await import('../routes/chain.routes.js');
  await app.register(chainRoutes, {
    cfg: {
      RPC_BNB_PRIMARY: 'https://bsc-rpc.example.com',
      RPC_SOLANA_PRIMARY: 'https://sol-rpc.example.com',
    } as never,
  });
  await app.ready();
  return { app, mockRedis };
}

// ── Tests: GET /chain/gas-history ─────────────────────────────────────────────

describe('GET /chain/gas-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns history with computed stats for bnb', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/chain/gas-history?chain=bnb' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points).toHaveLength(3);
    expect(body.current).toBe(6.0);
    expect(body.avg).toBeCloseTo(5.5, 5);
    expect(body.min).toBe(5.0);
    expect(body.max).toBe(6.0);
    await app.close();
  });

  it('returns history for sol chain', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/chain/gas-history?chain=sol' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.points)).toBe(true);
    await app.close();
  });

  it('returns empty result when no redis members', async () => {
    const { app } = await buildApp({ redisMembers: [] });
    const res = await app.inject({ method: 'GET', url: '/chain/gas-history?chain=bnb' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.points).toEqual([]);
    expect(body.current).toBeNull();
    expect(body.avg).toBeNull();
    expect(body.min).toBeNull();
    expect(body.max).toBeNull();
    await app.close();
  });

  it('skips malformed redis members', async () => {
    const { app } = await buildApp({
      redisMembers: ['not-json', '{"ts":"2026-01-15T10:00:00Z","price":5.0}', '{"bad":"shape"}'],
    });
    const res = await app.inject({ method: 'GET', url: '/chain/gas-history?chain=bnb' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Only the valid member is included
    expect(body.points).toHaveLength(1);
    await app.close();
  });

  it('queries Redis with 24h lookback window', async () => {
    const { app, mockRedis } = await buildApp();
    await app.inject({ method: 'GET', url: '/chain/gas-history?chain=bnb&range=24h' });
    expect(mockRedis.zrangebyscore).toHaveBeenCalledWith('gas:bnb', expect.any(Number), '+inf');
    const callArgs = mockRedis.zrangebyscore.mock.calls[0];
    const since = callArgs[1] as number;
    expect(Date.now() - since).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(Date.now() - since).toBeLessThan(25 * 60 * 60 * 1000);
    await app.close();
  });

  it('uses gas:sol key for sol chain', async () => {
    const { app, mockRedis } = await buildApp({ redisMembers: [] });
    await app.inject({ method: 'GET', url: '/chain/gas-history?chain=sol' });
    expect(mockRedis.zrangebyscore).toHaveBeenCalledWith('gas:sol', expect.any(Number), '+inf');
    await app.close();
  });

  it('returns 400 for invalid chain', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/chain/gas-history?chain=eth' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: GET /chain/gas-current ─────────────────────────────────────────────

describe('GET /chain/gas-current', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns live BNB gas price in gwei', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/chain/gas-current?chain=bnb' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.chain).toBe('bnb');
    expect(body.unit).toBe('gwei');
    expect(typeof body.price).toBe('number');
    expect(body.price).toBeGreaterThan(0);
    expect(body.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });

  it('returns live Solana fee in SOL/sig', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/chain/gas-current?chain=sol' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.chain).toBe('sol');
    expect(body.unit).toBe('SOL/sig');
    expect(typeof body.price).toBe('number');
    await app.close();
  });

  it('returns price=null on RPC error (graceful degradation)', async () => {
    const { app } = await buildApp({
      getFeeDataFn: async () => {
        throw new Error('RPC timeout');
      },
    });
    const res = await app.inject({ method: 'GET', url: '/chain/gas-current?chain=bnb' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.price).toBeNull();
    await app.close();
  });

  it('returns price=0 for empty prioritization fees array', async () => {
    const { app } = await buildApp({
      solFeesFn: async () => [],
    });
    const res = await app.inject({ method: 'GET', url: '/chain/gas-current?chain=sol' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.price).toBe(0);
    await app.close();
  });

  it('returns 400 for invalid chain', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/chain/gas-current?chain=eth' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns maxFeePerGas when gasPrice is null', async () => {
    const { app } = await buildApp({
      getFeeDataFn: async () => ({ gasPrice: null, maxFeePerGas: 10_000_000_000n }),
    });
    const res = await app.inject({ method: 'GET', url: '/chain/gas-current?chain=bnb' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.price).toBeGreaterThan(0);
    await app.close();
  });
});
