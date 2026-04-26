import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Tests for plugins/error-handler.plugin.ts
// Covers: Zod request validation → 400, response serialization → 500,
//         HTTP errors pass through, unknown 500 errors, prod vs dev stack leak
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

async function buildApp(nodeEnv?: string) {
  if (nodeEnv !== undefined) {
    process.env.NODE_ENV = nodeEnv;
  }

  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const { default: errorHandlerPlugin } = await import('../plugins/error-handler.plugin.js');
  await app.register(errorHandlerPlugin);

  // Route with Zod body schema — triggers hasZodFastifySchemaValidationErrors on bad input
  app.withTypeProvider().post(
    '/validate',
    {
      schema: {
        body: z.object({ name: z.string(), age: z.number() }),
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (_req, reply) => reply.code(200).send({ ok: true })
  );

  // Route that returns a wrong response type — triggers isResponseSerializationError
  app.withTypeProvider().get(
    '/bad-response',
    {
      schema: {
        response: { 200: z.object({ count: z.number() }) },
      },
    },
    async (_req, reply) => {
      // biome-ignore lint/suspicious/noExplicitAny: deliberate wrong type for test — validates serializer rejects bad shape
      const wrongBody = { count: 'not-a-number' } as any;
      return reply.code(200).send(wrongBody);
    }
  );

  // Route that throws a generic 403 HTTP error
  app.get('/forbidden', async (_req, reply) => {
    const err = Object.assign(new Error('Access denied'), { statusCode: 403, code: 'FORBIDDEN' });
    throw err;
  });

  // Route that throws a plain 500 error
  app.get('/explode', async () => {
    throw Object.assign(new Error('Something broke'), { code: 'EXPLODED' });
  });

  await app.ready();
  return app;
}

describe('error-handler.plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns 400 with VALIDATION_ERROR for invalid Zod request body', async () => {
    const app = await buildApp('test');
    const res = await app.inject({
      method: 'POST',
      url: '/validate',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Alice', age: 'not-a-number' }, // age should be number
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Request validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 500 with SERIALIZATION_ERROR when response type is wrong', async () => {
    const app = await buildApp('test');
    const res = await app.inject({ method: 'GET', url: '/bad-response' });
    await app.close();

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('SERIALIZATION_ERROR');
    expect(body.message).toBe('Internal server error');
  });

  it('passes through HTTP errors with their original status code', async () => {
    const app = await buildApp('test');
    const res = await app.inject({ method: 'GET', url: '/forbidden' });
    await app.close();

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 500 for unknown errors in non-production (exposes message)', async () => {
    const app = await buildApp('test');
    const res = await app.inject({ method: 'GET', url: '/explode' });
    await app.close();

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('EXPLODED');
    expect(body.message).toBe('Something broke');
  });

  it('hides error message in production for 5xx errors', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    const app = await buildApp('production');
    const res = await app.inject({ method: 'GET', url: '/explode' });
    await app.close();

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.message).toBe('Internal server error');
  });

  it('includes x-request-id as trace_id when header is present', async () => {
    const app = await buildApp('test');
    const res = await app.inject({
      method: 'GET',
      url: '/explode',
      headers: { 'x-request-id': 'trace-abc-123' },
    });
    await app.close();

    const body = JSON.parse(res.body);
    expect(body.trace_id).toBe('trace-abc-123');
  });

  it('does not include stack in production response', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    const app = await buildApp('production');
    const res = await app.inject({ method: 'GET', url: '/explode' });
    await app.close();

    const body = JSON.parse(res.body);
    expect(body.stack).toBeUndefined();
  });
});
