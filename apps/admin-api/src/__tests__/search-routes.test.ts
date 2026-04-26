import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for search.routes.ts
// Tests: GET /search — empty query, user/withdrawal/sweep/deposit results,
//        treasurer PII exclusion, limit param
// Uses Fastify inject + mocked DB — no real Postgres
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const WD_ID = '00000000-0000-0000-0000-000000000003';
const SWEEP_ID = '00000000-0000-0000-0000-000000000004';
const DEPOSIT_ID = '00000000-0000-0000-0000-000000000005';

type SelectArgs = Record<string, unknown> | undefined;

function makeSelectMock(
  opts: {
    userRows?: Record<string, unknown>[];
    wdRows?: Record<string, unknown>[];
    sweepRows?: Record<string, unknown>[];
    depositRows?: Record<string, unknown>[];
  } = {}
) {
  const userRows = opts.userRows ?? [{ id: USER_ID, email: 'alice@example.com', status: 'active' }];
  const wdRows = opts.wdRows ?? [
    { id: WD_ID, chain: 'bnb', token: 'USDT', amount: '1000', status: 'pending' },
  ];
  const sweepRows = opts.sweepRows ?? [
    { id: SWEEP_ID, chain: 'bnb', amount: '500', status: 'confirmed', txHash: '0xsweep' },
  ];
  const depositRows = opts.depositRows ?? [
    { id: DEPOSIT_ID, chain: 'bnb', amount: '200', status: 'credited', txHash: '0xdeposit' },
  ];

  // The search route calls select() four times (users, withdrawals, sweeps, deposits)
  // each with a different field shape. We distinguish by field key presence.
  return vi.fn((fields?: SelectArgs) => {
    const f = fields as Record<string, unknown> | undefined;

    if (f && 'email' in f) {
      // users query
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(userRows),
          }),
        }),
      };
    }

    if (f && 'destinationAddr' in f) {
      // withdrawals query
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(wdRows),
          }),
        }),
      };
    }

    if (f && 'fromAddr' in f) {
      // sweeps query
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(sweepRows),
          }),
        }),
      };
    }

    // deposits query (has txHash field)
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(depositRows),
        }),
      }),
    };
  });
}

async function buildApp(
  opts: {
    role?: string;
    userRows?: Record<string, unknown>[];
    wdRows?: Record<string, unknown>[];
    sweepRows?: Record<string, unknown>[];
    depositRows?: Record<string, unknown>[];
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('db', { select: makeSelectMock(opts) } as never);

  const role = opts.role ?? 'admin';
  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role },
    } as unknown as typeof req.session;
  });

  const { default: searchRoutes } = await import('../routes/search.routes.js');
  await app.register(searchRoutes);
  await app.ready();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns results for all entity types', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/search?q=alice' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.results)).toBe(true);
    // Should include users, withdrawals, sweeps, deposits
    const types = body.results.map((r: { type: string }) => r.type);
    expect(types).toContain('user');
    expect(types).toContain('withdrawal');
    expect(types).toContain('sweep');
    expect(types).toContain('deposit');
    await app.close();
  });

  it('excludes user results for treasurer role', async () => {
    const app = await buildApp({ role: 'treasurer' });
    const res = await app.inject({ method: 'GET', url: '/search?q=alice' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const types = body.results.map((r: { type: string }) => r.type);
    expect(types).not.toContain('user');
    await app.close();
  });

  it('returns 400 when q param is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/search' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when q is empty string', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/search?q=' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns empty results when all DB queries return nothing', async () => {
    const app = await buildApp({
      userRows: [],
      wdRows: [],
      sweepRows: [],
      depositRows: [],
    });
    const res = await app.inject({ method: 'GET', url: '/search?q=nomatch' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toEqual([]);
    await app.close();
  });

  it('respects custom limit parameter', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/search?q=test&limit=5' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('each result has required fields', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/search?q=alice' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    for (const result of body.results) {
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('label');
      expect(result).toHaveProperty('subtitle');
      expect(result).toHaveProperty('href');
    }
    await app.close();
  });

  it('returns 400 for q exceeding 200 chars', async () => {
    const app = await buildApp();
    const longQ = 'a'.repeat(201);
    const res = await app.inject({ method: 'GET', url: `/search?q=${longQ}` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
