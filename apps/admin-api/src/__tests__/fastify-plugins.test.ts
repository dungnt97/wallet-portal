import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
// Tests for Fastify infrastructure plugins:
//   db.plugin.ts         — decorates app.db, onClose calls client.end()
//   redis.plugin.ts      — decorates app.redis, handles connect failure, onClose quits
//   socket.plugin.ts     — decorates app.io, staffId room join, /stream namespace
//   telemetry.plugin.ts  — /metrics endpoint, per-request hooks
//   swagger.plugin.ts    — /openapi.json endpoint, swagger UI registered

// ── Mock external deps ────────────────────────────────────────────────────────

vi.mock('../db/index.js', () => ({
  makeDb: vi.fn().mockReturnValue({
    $client: { end: vi.fn().mockResolvedValue(undefined) },
  }),
}));

const mockRedisConnect = vi.fn().mockResolvedValue(undefined);
const mockRedisQuit = vi.fn().mockResolvedValue(undefined);
const mockRedisGet = vi.fn().mockResolvedValue(null);
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      connect: mockRedisConnect,
      quit: mockRedisQuit,
      get: mockRedisGet,
      options: { host: 'localhost', port: 6379 },
    })),
  };
});

const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
}));

vi.mock('../workers/reconciliation-snapshot.worker.js', () => ({
  RECON_RUN_QUEUE: 'reconciliation-run',
  registerReconRepeatableJobs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../workers/notif-sms.worker.js', () => ({
  SMS_QUEUE: 'notif_sms',
}));

vi.mock('../workers/pg-backup.worker.js', () => ({
  PG_BACKUP_QUEUE: 'pg_backup',
}));

vi.mock('../services/notify-staff.service.js', () => ({
  EMAIL_IMMEDIATE_QUEUE: 'notif_email_immediate',
  SLACK_WEBHOOK_QUEUE: 'notif_slack',
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/withdrawal-create.service.js', () => ({
  COLD_TIMELOCK_QUEUE: 'cold_timelock_broadcast',
}));

const mockSocketIoClose = vi.fn().mockImplementation((cb: () => void) => cb());
const mockSocketIoOf = vi.fn().mockReturnValue({
  on: vi.fn(),
  emit: vi.fn(),
});
vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(() => ({
    of: mockSocketIoOf,
    close: mockSocketIoClose,
  })),
}));

vi.mock('@opentelemetry/api', () => ({
  trace: { getTracer: vi.fn() },
}));

vi.mock('../telemetry/metrics.js', () => ({
  httpRequestsTotal: { inc: vi.fn() },
  httpRequestDurationSeconds: { observe: vi.fn() },
  registry: {
    metrics: vi.fn().mockResolvedValue('# HELP test\n'),
    contentType: 'text/plain',
  },
  notifSmsDroppedTotal: { inc: vi.fn() },
}));

vi.mock('@fastify/swagger', () => ({
  default: vi.fn().mockImplementation(async () => {}),
}));

vi.mock('@fastify/swagger-ui', () => ({
  default: vi.fn().mockImplementation(async () => {}),
}));

vi.mock('fastify-type-provider-zod', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fastify-type-provider-zod')>();
  return {
    ...actual,
    jsonSchemaTransform: vi.fn().mockReturnValue({}),
  };
});

// ── db.plugin.ts ──────────────────────────────────────────────────────────────

describe('db.plugin', () => {
  it('decorates app.db via makeDb', async () => {
    const app = Fastify({ logger: false });
    const { default: dbPlugin } = await import('../plugins/db.plugin.js');
    await app.register(dbPlugin, { DATABASE_URL: 'postgresql://localhost/test' });
    await app.ready();

    expect(app.db).toBeDefined();
    await app.close();
  });

  it('calls client.end() in onClose hook', async () => {
    const { makeDb } = await import('../db/index.js');
    const mockEnd = vi.fn().mockResolvedValue(undefined);
    vi.mocked(makeDb).mockReturnValueOnce({ $client: { end: mockEnd } } as never);

    const app = Fastify({ logger: false });
    const { default: dbPlugin } = await import('../plugins/db.plugin.js');
    await app.register(dbPlugin, { DATABASE_URL: 'postgresql://localhost/test' });
    await app.ready();
    await app.close();

    expect(mockEnd).toHaveBeenCalledTimes(1);
  });
});

// ── redis.plugin.ts ───────────────────────────────────────────────────────────

describe('redis.plugin', () => {
  it('decorates app.redis after connecting', async () => {
    const app = Fastify({ logger: false });
    const { default: redisPlugin } = await import('../plugins/redis.plugin.js');
    await app.register(redisPlugin, { REDIS_URL: 'redis://localhost:6379' });
    await app.ready();

    expect(app.redis).toBeDefined();
    expect(mockRedisConnect).toHaveBeenCalled();
    await app.close();
  });

  it('continues in degraded mode when redis.connect() fails', async () => {
    mockRedisConnect.mockRejectedValueOnce(new Error('connection refused'));

    const app = Fastify({ logger: false });
    const { default: redisPlugin } = await import('../plugins/redis.plugin.js');
    await app.register(redisPlugin, { REDIS_URL: 'redis://localhost:6379' });
    // Should not throw even if connect fails — degraded mode
    let didThrow = false;
    try {
      await app.ready();
    } catch {
      didThrow = true;
    }
    expect(didThrow).toBe(false);
    await app.close();
  });

  it('calls redis.quit() in onClose hook', async () => {
    mockRedisConnect.mockResolvedValue(undefined);

    const app = Fastify({ logger: false });
    const { default: redisPlugin } = await import('../plugins/redis.plugin.js');
    await app.register(redisPlugin, { REDIS_URL: 'redis://localhost:6379' });
    await app.ready();
    await app.close();

    expect(mockRedisQuit).toHaveBeenCalled();
  });
});

// ── socket.plugin.ts ──────────────────────────────────────────────────────────

describe('socket.plugin', () => {
  it('decorates app.io with a Socket.io Server', async () => {
    const app = Fastify({ logger: false });
    // Ensure app.redis is available (queue plugin depends on it)
    app.decorate('redis', { options: { host: 'localhost', port: 6379 } } as never);

    const { default: socketPlugin } = await import('../plugins/socket.plugin.js');
    await app.register(socketPlugin, { CORS_ORIGIN: 'https://localhost:3000' });
    await app.ready();

    expect(app.io).toBeDefined();
    expect(mockSocketIoOf).toHaveBeenCalledWith('/stream');
    await app.close();
  });
});

// ── queue.plugin.ts ───────────────────────────────────────────────────────────

// Stub redis plugin that satisfies the 'redis' dependency name required by queue.plugin
async function buildAppWithRedisStub() {
  const app = Fastify({ logger: false });
  // Register a fastify-plugin with name='redis' so queue plugin's dependency check passes
  const fp = (await import('fastify-plugin')).default;
  const redisStub = fp(
    async (a: FastifyInstance) => {
      a.decorate('redis', { options: { host: 'localhost', port: 6379 } } as never);
    },
    { name: 'redis' }
  );
  await app.register(redisStub);
  return app;
}

describe('queue.plugin', () => {
  it('decorates app with all queue instances', async () => {
    const app = await buildAppWithRedisStub();
    const { default: queuePlugin } = await import('../plugins/queue.plugin.js');
    await app.register(queuePlugin);
    await app.ready();

    expect(app.queue).toBeDefined();
    expect(app.sweepQueue).toBeDefined();
    expect(app.emailQueue).toBeDefined();
    expect(app.slackQueue).toBeDefined();
    await app.close();
  });

  it('closes all queues in onClose hook', async () => {
    mockQueueClose.mockClear();
    const app = await buildAppWithRedisStub();
    const { default: queuePlugin } = await import('../plugins/queue.plugin.js');
    await app.register(queuePlugin);
    await app.ready();
    await app.close();

    // Multiple queues should be closed
    expect(mockQueueClose.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});

// ── telemetry.plugin.ts ───────────────────────────────────────────────────────

describe('telemetry.plugin', () => {
  it('exposes GET /metrics endpoint returning Prometheus text', async () => {
    const app = Fastify({ logger: false });
    const { default: telemetryPlugin } = await import('../plugins/telemetry.plugin.js');
    await app.register(telemetryPlugin);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/metrics' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('records httpRequestsTotal on each response', async () => {
    const { httpRequestsTotal } = await import('../telemetry/metrics.js');
    const app = Fastify({ logger: false });
    const { default: telemetryPlugin } = await import('../plugins/telemetry.plugin.js');
    await app.register(telemetryPlugin);
    app.get('/ping', async (_req, reply) => reply.send({ ok: true }));
    await app.ready();

    await app.inject({ method: 'GET', url: '/ping' });
    await app.close();

    expect(httpRequestsTotal.inc).toHaveBeenCalled();
  });

  it('records httpRequestDurationSeconds on each response', async () => {
    const { httpRequestDurationSeconds } = await import('../telemetry/metrics.js');
    const app = Fastify({ logger: false });
    const { default: telemetryPlugin } = await import('../plugins/telemetry.plugin.js');
    await app.register(telemetryPlugin);
    app.get('/ping2', async (_req, reply) => reply.send({ ok: true }));
    await app.ready();

    await app.inject({ method: 'GET', url: '/ping2' });
    await app.close();

    expect(httpRequestDurationSeconds.observe).toHaveBeenCalled();
  });

  it('sets x-request-id response header from incoming header', async () => {
    const app = Fastify({ logger: false });
    const { default: telemetryPlugin } = await import('../plugins/telemetry.plugin.js');
    await app.register(telemetryPlugin);
    app.get('/ping3', async (_req, reply) => reply.send({ ok: true }));
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/ping3',
      headers: { 'x-request-id': 'req-trace-xyz' },
    });
    await app.close();

    expect(res.headers['x-request-id']).toBe('req-trace-xyz');
  });
});

// ── swagger.plugin.ts ─────────────────────────────────────────────────────────

describe('swagger.plugin', () => {
  it('registers swagger and swagger-ui without throwing', async () => {
    const app = Fastify({ logger: false });
    const { default: swaggerPlugin } = await import('../plugins/swagger.plugin.js');
    await app.register(swaggerPlugin);
    await app.ready();
    await app.close();
  });
});
