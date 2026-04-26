import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Supplemental ops-health route tests that exercise the getLatestBlock closures
// by allowing probeChain to call through while mocking fetch.
// This covers lines 86-99, 105-113 in ops-health.routes.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock notify-staff but let probeChain + probeDb/Redis/etc. run
vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

// Mock health-probes service partially: mock everything except probeChain
// so the closure is invoked
vi.mock('../services/health-probes.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/health-probes.service.js')>();
  return {
    ...actual,
    probeDb: vi.fn().mockResolvedValue({ status: 'ok' }),
    probeRedis: vi.fn().mockResolvedValue({ status: 'ok' }),
    probePolicyEngine: vi.fn().mockResolvedValue({ status: 'ok' }),
    probeQueue: vi.fn().mockResolvedValue({ name: 'q', depth: 0, status: 'ok' }),
    probeWorkers: vi.fn().mockResolvedValue([]),
    checkDegradationTransition: vi.fn().mockReturnValue(false),
    // probeChain is NOT mocked — uses real implementation which calls getLatestBlock
  };
});

const STAFF_ID = '00000000-0000-0000-0000-000000000001';

async function buildRealChainProbeApp() {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const mockQuery = {
    watcherCheckpoints: { findFirst: vi.fn().mockResolvedValue(undefined) },
  };
  app.decorate('db', { query: mockQuery, execute: vi.fn() } as never);
  app.decorate('redis', { get: vi.fn().mockResolvedValue(null) } as never);
  app.decorate('queue', { add: vi.fn() } as never);
  app.decorate('sweepQueue', { add: vi.fn() } as never);
  app.decorate('io', { of: vi.fn().mockReturnValue({ emit: vi.fn() }) } as never);
  app.decorate('emailQueue', { add: vi.fn() } as never);
  app.decorate('slackQueue', { add: vi.fn() } as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { default: opsHealthRoutes } = await import('../routes/ops-health.routes.js');
  await app.register(opsHealthRoutes);
  await app.ready();
  return app;
}

describe('GET /ops/health — chain probe closures', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-set mock implementations after clearAllMocks wipes them
    const probes = await import('../services/health-probes.service.js');
    vi.mocked(probes.probeDb).mockResolvedValue({ status: 'ok' });
    vi.mocked(probes.probeRedis).mockResolvedValue({ status: 'ok' });
    vi.mocked(probes.probePolicyEngine).mockResolvedValue({ status: 'ok' });
    vi.mocked(probes.probeQueue).mockResolvedValue({ name: 'q', depth: 0, status: 'ok' });
    vi.mocked(probes.probeWorkers).mockResolvedValue([]);
    vi.mocked(probes.checkDegradationTransition).mockReturnValue(false);
  });

  afterEach(() => vi.restoreAllMocks());

  it('executes BNB and SOL getLatestBlock closures via RPC calls', async () => {
    // Distinguish BNB vs SOL by the request body method field
    global.fetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string) as { method: string };
      if (body.method === 'eth_blockNumber') {
        return { ok: true, json: async () => ({ result: '0x2625A00' }) }; // 40000000
      }
      // getSlot (Solana)
      return { ok: true, json: async () => ({ result: 280000000 }) };
    }) as unknown as typeof fetch;

    const app = await buildRealChainProbeApp();
    const res = await app.inject({ method: 'GET', url: '/ops/health' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.chains).toHaveLength(2);
    const bnb = body.chains.find((c: { id: string }) => c.id === 'bnb');
    expect(bnb?.latestBlock).toBe(40000000);
    const sol = body.chains.find((c: { id: string }) => c.id === 'sol');
    expect(sol?.latestBlock).toBe(280000000);
  });

  it('marks chain as error when RPC fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;

    const app = await buildRealChainProbeApp();
    const res = await app.inject({ method: 'GET', url: '/ops/health' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Both chains should error since fetch is rejected
    expect(body.chains.every((c: { status: string }) => c.status === 'error')).toBe(true);
  });

  it('falls back to 0 when SOL result field is absent', async () => {
    global.fetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string) as { method: string };
      if (body.method === 'eth_blockNumber') {
        return { ok: true, json: async () => ({ result: '0x1' }) }; // BNB = 1
      }
      // SOL: no result field → falls back to 0
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch;

    const app = await buildRealChainProbeApp();
    const res = await app.inject({ method: 'GET', url: '/ops/health' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const sol = body.chains.find((c: { id: string }) => c.id === 'sol');
    expect(sol?.latestBlock).toBe(0);
  });
});
