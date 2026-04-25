// Unit tests for GET /internal/withdrawals/:id/signatures endpoint in internal.routes.ts
// Tests: happy path (multiple signers), withdrawal not found, no multisigOpId, empty approvals.
// Uses Fastify inject + in-memory mocks — no real Postgres or Socket.io required.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks (must precede service imports) ───────────────────────────────

vi.mock('../services/deposit-credit.service.js', () => ({
  creditDeposit: vi
    .fn()
    .mockResolvedValue({
      id: 'dep-1',
      userId: 'u-1',
      status: 'credited',
      txHash: 'h',
      amount: '100',
      token: 'USDT',
      chain: 'bnb',
    }),
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class ConflictError extends Error {
    statusCode = 409;
    code = 'CONFLICT';
    constructor(m: string) {
      super(m);
      this.name = 'ConflictError';
    }
  },
}));

vi.mock('../services/sweep-create.service.js', () => ({
  recordSweepBroadcasted: vi.fn().mockResolvedValue(undefined),
  recordSweepConfirmed: vi.fn().mockResolvedValue(undefined),
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
}));

vi.mock('../services/withdrawal-execute.service.js', () => ({
  recordBroadcasted: vi.fn().mockResolvedValue(undefined),
  recordConfirmed: vi.fn().mockResolvedValue(undefined),
  executeWithdrawal: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class ConflictError extends Error {
    statusCode = 409;
    code = 'CONFLICT';
    constructor(m: string) {
      super(m);
      this.name = 'ConflictError';
    }
  },
}));

vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../events/emit-deposit-credited.js', () => ({
  emitDepositCredited: vi.fn(),
}));

// ── Fastify test helper ───────────────────────────────────────────────────────

import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

const BEARER = 'test-internal-secret';
const WD_ID = '00000000-0000-0000-0000-000000000001';
const OP_ID = '00000000-0000-0000-0000-000000000002';

function makeApproval(signer: string, signature: string) {
  return { signer, signature };
}

async function buildApp(opts: {
  withdrawal?: Record<string, unknown> | null;
  approvals?: { signer: string; signature: string }[];
}) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const emitFn = vi.fn();
  const mockIo = { of: vi.fn().mockReturnValue({ emit: emitFn }), _emit: emitFn };
  const mockQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
  const mockEmailQueue = { add: vi.fn() };
  const mockSlackQueue = { add: vi.fn() };

  const approvals = opts.approvals ?? [];
  const mockDb = {
    query: {
      withdrawals: {
        findFirst: vi.fn().mockResolvedValue(opts.withdrawal ?? null),
      },
      multisigOperations: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: OP_ID, collectedSigs: approvals.length, requiredSigs: 2 }),
      },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(approvals),
        }),
      }),
    }),
  };

  app.decorate('db', mockDb as never);
  app.decorate('io', mockIo as never);
  app.decorate('queue', mockQueue as never);
  app.decorate('emailQueue', mockEmailQueue as never);
  app.decorate('slackQueue', mockSlackQueue as never);

  const { default: internalRoutes } = await import('../routes/internal.routes.js');
  await app.register(internalRoutes, { bearerToken: BEARER });
  await app.ready();
  return app;
}

function authHeader() {
  return { authorization: `Bearer ${BEARER}` };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /internal/withdrawals/:id/signatures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path — returns signer addresses and signatures', async () => {
    const approvals = [makeApproval('0xSignerA', '0xSigA'), makeApproval('0xSignerB', '0xSigB')];
    const app = await buildApp({
      withdrawal: {
        id: WD_ID,
        status: 'approved',
        sourceTier: 'hot',
        multisigOpId: OP_ID,
        timeLockExpiresAt: null,
      },
      approvals,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/withdrawals/${WD_ID}/signatures`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.signatures).toHaveLength(2);
    expect(body.signatures).toContainEqual({ signer: '0xSignerA', signature: '0xSigA' });
    expect(body.signatures).toContainEqual({ signer: '0xSignerB', signature: '0xSigB' });
    await app.close();
  });

  it('returns empty signatures array when no approvals exist', async () => {
    const app = await buildApp({
      withdrawal: {
        id: WD_ID,
        status: 'approved',
        sourceTier: 'hot',
        multisigOpId: OP_ID,
        timeLockExpiresAt: null,
      },
      approvals: [],
    });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/withdrawals/${WD_ID}/signatures`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.signatures).toEqual([]);
    await app.close();
  });

  it('returns 404 when withdrawal not found', async () => {
    const app = await buildApp({ withdrawal: null });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/withdrawals/${WD_ID}/signatures`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 404 when withdrawal has no multisigOpId', async () => {
    const app = await buildApp({
      withdrawal: {
        id: WD_ID,
        status: 'pending',
        sourceTier: 'hot',
        multisigOpId: null,
        timeLockExpiresAt: null,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/withdrawals/${WD_ID}/signatures`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 401 when bearer token is missing', async () => {
    const app = await buildApp({ withdrawal: null });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/withdrawals/${WD_ID}/signatures`,
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 401 when bearer token is invalid', async () => {
    const app = await buildApp({ withdrawal: null });

    const res = await app.inject({
      method: 'GET',
      url: `/internal/withdrawals/${WD_ID}/signatures`,
      headers: { authorization: 'Bearer wrong-token' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
