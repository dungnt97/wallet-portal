import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for health.routes.ts
// Tests: GET /health/live, GET /health/ready
// Uses Fastify inject + mocked db/redis decorators
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Test helpers ──────────────────────────────────────────────────────���───────

async function buildApp(
  opts: {
    dbOk?: boolean;
    redisOk?: boolean;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const dbOk = opts.dbOk !== false;
  const redisOk = opts.redisOk !== false;

  const mockDb = {
    execute: dbOk ? vi.fn().mockResolvedValue([]) : vi.fn().mockRejectedValue(new Error('db down')),
  };
  const mockRedis = {
    ping: redisOk
      ? vi.fn().mockResolvedValue('PONG')
      : vi.fn().mockRejectedValue(new Error('redis down')),
  };

  app.decorate('db', mockDb as never);
  app.decorate('redis', mockRedis as never);

  const { default: healthRoutes } = await import('../routes/health.routes.js');
  await app.register(healthRoutes);
  await app.ready();
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────��────────

describe('GET /health/live', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 ok', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('ok');
    await app.close();
  });
});

describe('GET /health/ready', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 when db and redis are healthy', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(body.redis).toBe('ok');
    await app.close();
  });

  it('returns 503 when db is down', async () => {
    const app = await buildApp({ dbOk: false });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('error');
    expect(body.redis).toBe('ok');
    await app.close();
  });

  it('returns 503 when redis is down', async () => {
    const app = await buildApp({ redisOk: false });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('ok');
    expect(body.redis).toBe('error');
    await app.close();
  });

  it('returns 503 when both db and redis are down', async () => {
    const app = await buildApp({ dbOk: false, redisOk: false });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.db).toBe('error');
    expect(body.redis).toBe('error');
    await app.close();
  });
});
