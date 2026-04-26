import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for ops-health.routes.ts
// Tests: GET /ops/health — all probes ok, partial degradation, full error fallback
// Mocks all health-probes service functions + notify-staff
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/health-probes.service.js', () => ({
  probeDb: vi.fn(),
  probeRedis: vi.fn(),
  probePolicyEngine: vi.fn(),
  probeChain: vi.fn(),
  probeQueue: vi.fn(),
  probeWorkers: vi.fn(),
  checkDegradationTransition: vi.fn().mockReturnValue(false),
  resetHealthStateCache: vi.fn(),
}));

vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';

function makeOkProbes() {
  return {
    db: { status: 'ok' as const },
    redis: { status: 'ok' as const },
    policyEngine: { status: 'ok' as const },
    chain: {
      id: 'bnb',
      rpc: 'https://bsc-rpc',
      latestBlock: 40000000,
      checkpointBlock: 40000000,
      lagBlocks: 0,
      status: 'ok' as const,
    },
    queue: { name: 'main', depth: 0, status: 'ok' as const },
    workers: [{ name: 'sweep-worker', lastHeartbeatAgoSec: 5, status: 'ok' as const }],
  };
}

async function buildApp(
  opts: {
    probes?: Partial<ReturnType<typeof makeOkProbes>>;
    degradationTransitions?: boolean;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const mockQueue = { add: vi.fn() };
  app.decorate('db', {} as never);
  app.decorate('redis', {} as never);
  app.decorate('queue', mockQueue as never);
  app.decorate('sweepQueue', mockQueue as never);
  app.decorate('io', { of: vi.fn().mockReturnValue({ emit: vi.fn() }) } as never);
  app.decorate('emailQueue', { add: vi.fn() } as never);
  app.decorate('slackQueue', { add: vi.fn() } as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const {
    probeDb,
    probeRedis,
    probePolicyEngine,
    probeChain,
    probeQueue,
    probeWorkers,
    checkDegradationTransition,
  } = await import('../services/health-probes.service.js');

  const p = { ...makeOkProbes(), ...opts.probes };

  vi.mocked(probeDb).mockResolvedValue(p.db);
  vi.mocked(probeRedis).mockResolvedValue(p.redis);
  vi.mocked(probePolicyEngine).mockResolvedValue(p.policyEngine);
  vi.mocked(probeChain).mockResolvedValue(p.chain);
  vi.mocked(probeQueue).mockResolvedValue(p.queue);
  vi.mocked(probeWorkers).mockResolvedValue(p.workers);
  vi.mocked(checkDegradationTransition).mockReturnValue(opts.degradationTransitions ?? false);

  const { default: opsHealthRoutes } = await import('../routes/ops-health.routes.js');
  await app.register(opsHealthRoutes);
  await app.ready();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /ops/health', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with all probes ok', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ops/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.db.status).toBe('ok');
    expect(body.redis.status).toBe('ok');
    expect(body.policyEngine.status).toBe('ok');
    expect(Array.isArray(body.chains)).toBe(true);
    expect(Array.isArray(body.queues)).toBe(true);
    expect(Array.isArray(body.workers)).toBe(true);
    await app.close();
  });

  it('returns error status for degraded db', async () => {
    const app = await buildApp({
      probes: { db: { status: 'error' as const, error: 'connection refused' } },
    });
    const res = await app.inject({ method: 'GET', url: '/ops/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.db.status).toBe('error');
    await app.close();
  });

  it('still returns 200 when policy engine probe fails (graceful degradation)', async () => {
    const app = await buildApp({
      probes: { policyEngine: { status: 'error' as const, error: 'timeout' } },
    });
    const res = await app.inject({ method: 'GET', url: '/ops/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.policyEngine.status).toBe('error');
    await app.close();
  });

  it('includes chain probe results', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ops/health' });
    const body = JSON.parse(res.body);
    expect(body.chains.length).toBeGreaterThan(0);
    expect(body.chains[0]).toHaveProperty('id');
    expect(body.chains[0]).toHaveProperty('status');
    await app.close();
  });

  it('includes queue probe results', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ops/health' });
    const body = JSON.parse(res.body);
    expect(body.queues.length).toBeGreaterThan(0);
    expect(body.queues[0]).toHaveProperty('name');
    expect(body.queues[0]).toHaveProperty('depth');
    await app.close();
  });

  it('includes worker heartbeat results', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ops/health' });
    const body = JSON.parse(res.body);
    expect(body.workers.length).toBeGreaterThan(0);
    expect(body.workers[0]).toHaveProperty('name');
    expect(body.workers[0]).toHaveProperty('lastHeartbeatAgoSec');
    await app.close();
  });

  it('fires degradation notifications on fresh ok→error transitions', async () => {
    const { notifyStaff } = await import('../services/notify-staff.service.js');
    const app = await buildApp({
      probes: { db: { status: 'error' as const, error: 'down' } },
      degradationTransitions: true,
    });
    const res = await app.inject({ method: 'GET', url: '/ops/health' });
    expect(res.statusCode).toBe(200);
    // notifyStaff called at least once for degraded components
    expect(vi.mocked(notifyStaff)).toHaveBeenCalled();
    await app.close();
  });
});
