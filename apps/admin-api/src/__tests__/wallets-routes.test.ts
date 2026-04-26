import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for wallets.routes.ts
// Tests: GET /wallets — pagination, chain/tier/purpose filters
// Uses Fastify inject + mocked DB — no real Postgres
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const WALLET_ID = '00000000-0000-0000-0000-000000000002';

function makeWallet(overrides: Record<string, unknown> = {}) {
  return {
    id: WALLET_ID,
    chain: 'bnb' as const,
    address: '0xHotSafe',
    tier: 'hot' as const,
    purpose: 'operational' as const,
    multisigAddr: '0xMultisig',
    derivationPath: null,
    policyConfig: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

async function buildApp(
  opts: {
    walletRows?: Record<string, unknown>[];
    walletCount?: number;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const walletRows = opts.walletRows ?? [makeWallet()];
  const walletCount = opts.walletCount ?? walletRows.length;

  // select() is called twice via Promise.all: once for rows (list), once for count
  let callN = 0;
  const mockSelect = vi.fn((fields?: unknown) => {
    callN++;
    const f = fields as Record<string, unknown> | undefined;
    if (f && 'value' in f) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: walletCount }]),
        }),
      };
    }
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(walletRows),
            }),
          }),
        }),
      }),
    };
  });

  app.decorate('db', { select: mockSelect } as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { default: walletsRoutes } = await import('../routes/wallets.routes.js');
  await app.register(walletsRoutes);
  await app.ready();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /wallets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated wallet list', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/wallets?page=1&limit=20' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(WALLET_ID);
    expect(body.page).toBe(1);
    await app.close();
  });

  it('returns empty list', async () => {
    const app = await buildApp({ walletRows: [], walletCount: 0 });
    const res = await app.inject({ method: 'GET', url: '/wallets' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    await app.close();
  });

  it('filters by chain', async () => {
    const app = await buildApp({ walletRows: [makeWallet({ chain: 'sol' })] });
    const res = await app.inject({ method: 'GET', url: '/wallets?chain=sol' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].chain).toBe('sol');
    await app.close();
  });

  it('filters by tier', async () => {
    const app = await buildApp({ walletRows: [makeWallet({ tier: 'cold' })] });
    const res = await app.inject({ method: 'GET', url: '/wallets?tier=cold' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].tier).toBe('cold');
    await app.close();
  });

  it('filters by purpose', async () => {
    const app = await buildApp({ walletRows: [makeWallet({ purpose: 'cold_reserve' })] });
    const res = await app.inject({ method: 'GET', url: '/wallets?purpose=cold_reserve' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].purpose).toBe('cold_reserve');
    await app.close();
  });

  it('returns 400 for invalid chain', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/wallets?chain=eth' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 for invalid tier', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/wallets?tier=warm' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('serialises createdAt to ISO string', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/wallets' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });

  it('returns null for optional nullable wallet fields', async () => {
    const app = await buildApp({
      walletRows: [makeWallet({ multisigAddr: null, derivationPath: null, policyConfig: null })],
    });
    const res = await app.inject({ method: 'GET', url: '/wallets' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].multisigAddr).toBeNull();
    expect(body.data[0].derivationPath).toBeNull();
    await app.close();
  });
});
