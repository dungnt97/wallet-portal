import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for multisig-sync.routes.ts
// Tests: GET /multisig/sync-status, POST /multisig/sync-refresh
// Uses Fastify inject + global fetch mock
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';

function makeSyncStatus(overrides: Record<string, unknown> = {}) {
  return {
    bnb: { status: 'synced', lastSyncAt: '2026-01-01T00:00:00.000Z', nonce: 10 },
    sol: { status: 'synced', lastSyncAt: '2026-01-01T00:00:00.000Z' },
    ...overrides,
  };
}

async function buildApp(
  opts: {
    fetchOk?: boolean;
    fetchBody?: Record<string, unknown>;
    role?: string;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('db', {} as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: opts.role ?? 'admin' },
    } as unknown as typeof req.session;
  });

  const fetchOk = opts.fetchOk !== false;
  const fetchBody = opts.fetchBody ?? makeSyncStatus();

  global.fetch = vi.fn().mockResolvedValue({
    ok: fetchOk,
    status: fetchOk ? 200 : 503,
    json: async () => fetchBody,
  } as unknown as Response);

  const { default: multisigSyncRoutes } = await import('../routes/multisig-sync.routes.js');
  await app.register(multisigSyncRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /multisig/sync-status ─────────────────────────────────────────

describe('GET /multisig/sync-status', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('proxies sync status from wallet-engine', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/multisig/sync-status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.bnb.status).toBe('synced');
    expect(body.sol.status).toBe('synced');
    await app.close();
  });

  it('returns error fallback when wallet-engine returns non-2xx', async () => {
    const app = await buildApp({ fetchOk: false });
    const res = await app.inject({ method: 'GET', url: '/multisig/sync-status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Fallback: both chains set to error status
    expect(body.bnb.status).toBe('error');
    expect(body.sol.status).toBe('error');
    await app.close();
  });

  it('returns error fallback when fetch throws (network error)', async () => {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.decorate('db', {} as never);
    app.addHook('preHandler', async (req) => {
      req.session = { staff: { id: STAFF_ID, role: 'admin' } } as unknown as typeof req.session;
    });
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const { default: multisigSyncRoutes } = await import('../routes/multisig-sync.routes.js');
    await app.register(multisigSyncRoutes);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/multisig/sync-status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.bnb.status).toBe('error');
    expect(body.sol.status).toBe('error');
    await app.close();
  });
});

// ── Tests: POST /multisig/sync-refresh ───────────────────────────────────────

describe('POST /multisig/sync-refresh', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('triggers cache refresh and returns fresh sync status', async () => {
    const fresh = makeSyncStatus({
      bnb: { status: 'synced', lastSyncAt: '2026-01-01T12:00:00.000Z', nonce: 11 },
    });
    const app = await buildApp({ fetchBody: fresh });
    const res = await app.inject({ method: 'POST', url: '/multisig/sync-refresh' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.bnb.status).toBe('synced');
    await app.close();
  });

  it('returns error fallback when wallet-engine unreachable on refresh', async () => {
    const app = await buildApp({ fetchOk: false });
    const res = await app.inject({ method: 'POST', url: '/multisig/sync-refresh' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.bnb.status).toBe('error');
    await app.close();
  });
});
