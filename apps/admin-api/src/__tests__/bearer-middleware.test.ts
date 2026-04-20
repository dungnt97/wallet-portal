// Unit tests for bearer token middleware — constant-time compare, 401 paths
// Async preHandlers: "allow" = returns undefined; "deny" = calls reply.code(N).send(...)
import { describe, it, expect } from 'vitest';

const VALID_TOKEN = 'supersecretbearertoken1234';

describe('requireBearer', () => {
  const makeCtx = () => {
    const state = { statusCode: null as number | null, body: null as unknown };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reply: any = {
      code(n: number) { state.statusCode = n; return reply; },
      send(b: unknown) { state.body = b; return reply; },
    };
    return { reply, state };
  };

  it('sends 401 MISSING_BEARER when Authorization header is absent', async () => {
    const { requireBearer } = await import('../auth/bearer.middleware.js');
    const handler = requireBearer(VALID_TOKEN);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { headers: {} };
    const { reply, state } = makeCtx();
    await (handler as unknown as Function).call(undefined, req, reply);
    expect(state.statusCode).toBe(401);
    expect((state.body as { code: string }).code).toBe('MISSING_BEARER');
  });

  it('sends 401 MISSING_BEARER when header lacks Bearer prefix', async () => {
    const { requireBearer } = await import('../auth/bearer.middleware.js');
    const handler = requireBearer(VALID_TOKEN);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { headers: { authorization: VALID_TOKEN } };
    const { reply, state } = makeCtx();
    await (handler as unknown as Function).call(undefined, req, reply);
    expect(state.statusCode).toBe(401);
    expect((state.body as { code: string }).code).toBe('MISSING_BEARER');
  });

  it('sends 401 INVALID_BEARER when token is wrong', async () => {
    const { requireBearer } = await import('../auth/bearer.middleware.js');
    const handler = requireBearer(VALID_TOKEN);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { headers: { authorization: 'Bearer wrongtoken' } };
    const { reply, state } = makeCtx();
    await (handler as unknown as Function).call(undefined, req, reply);
    expect(state.statusCode).toBe(401);
    expect((state.body as { code: string }).code).toBe('INVALID_BEARER');
  });

  it('returns undefined (allow) when token is correct', async () => {
    const { requireBearer } = await import('../auth/bearer.middleware.js');
    const handler = requireBearer(VALID_TOKEN);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { headers: { authorization: `Bearer ${VALID_TOKEN}` } };
    const { reply, state } = makeCtx();
    const result = await (handler as unknown as Function).call(undefined, req, reply);
    expect(result).toBeUndefined();
    expect(state.statusCode).toBeNull();
  });
});
