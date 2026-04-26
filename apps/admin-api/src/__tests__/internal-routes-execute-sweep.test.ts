import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Supplemental internal-routes tests covering endpoints NOT in internal-signatures.test.ts:
//   POST /internal/withdrawals/:id/execute
//   POST /internal/sweeps/:id/broadcasted
//   POST /internal/sweeps/:id/confirmed
// Covers lines 243-352, 372-397 of internal.routes.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/deposit-credit.service.js', () => ({
  creditDeposit: vi.fn().mockResolvedValue({
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
  executeWithdrawal: vi.fn().mockResolvedValue({ jobId: 'job-exec-1' }),
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

// ── Test helpers ──────────────────────────────────────────────────────────────

const BEARER = 'test-internal-secret-exec';
const WD_ID = '00000000-0000-0000-0000-000000000011';
const SWEEP_ID = '00000000-0000-0000-0000-000000000022';

async function buildApp() {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const emitFn = vi.fn();
  const mockIo = { of: vi.fn().mockReturnValue({ emit: emitFn }), _emit: emitFn };
  const mockQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };

  const mockDb = {
    query: {
      withdrawals: { findFirst: vi.fn().mockResolvedValue(null) },
      multisigOperations: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
    }),
  };

  app.decorate('db', mockDb as never);
  app.decorate('io', mockIo as never);
  app.decorate('queue', mockQueue as never);
  app.decorate('emailQueue', { add: vi.fn() } as never);
  app.decorate('slackQueue', { add: vi.fn() } as never);

  const { default: internalRoutes } = await import('../routes/internal.routes.js');
  await app.register(internalRoutes, { bearerToken: BEARER });
  await app.ready();
  return { app, mockDb, mockIo, mockQueue };
}

function authHeader() {
  return { authorization: `Bearer ${BEARER}` };
}

// ── POST /internal/withdrawals/:id/execute ────────────────────────────────────

describe('POST /internal/withdrawals/:id/execute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('happy path — returns jobId from executeWithdrawal', async () => {
    const { app } = await buildApp();
    const { executeWithdrawal } = await import('../services/withdrawal-execute.service.js');
    vi.mocked(executeWithdrawal).mockResolvedValue({ jobId: 'job-exec-happy' } as never);

    const res = await app.inject({
      method: 'POST',
      url: `/internal/withdrawals/${WD_ID}/execute`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBe('job-exec-happy');
    await app.close();
  });

  it('returns 404 when executeWithdrawal throws WdNotFoundError', async () => {
    const { app } = await buildApp();
    const { executeWithdrawal, NotFoundError } = await import(
      '../services/withdrawal-execute.service.js'
    );
    vi.mocked(executeWithdrawal).mockRejectedValue(
      new NotFoundError(`Withdrawal ${WD_ID} not found`)
    );

    const res = await app.inject({
      method: 'POST',
      url: `/internal/withdrawals/${WD_ID}/execute`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 409 when executeWithdrawal throws ExecConflictError', async () => {
    const { app } = await buildApp();
    const { executeWithdrawal, ConflictError } = await import(
      '../services/withdrawal-execute.service.js'
    );
    vi.mocked(executeWithdrawal).mockRejectedValue(new ConflictError('already executing'));

    const res = await app.inject({
      method: 'POST',
      url: `/internal/withdrawals/${WD_ID}/execute`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('CONFLICT');
    await app.close();
  });

  it('returns 401 without auth header', async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/internal/withdrawals/${WD_ID}/execute`,
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ── POST /internal/sweeps/:id/broadcasted ─────────────────────────────────────

describe('POST /internal/sweeps/:id/broadcasted', () => {
  beforeEach(() => vi.clearAllMocks());

  it('happy path — records sweep broadcasted and returns ok=true', async () => {
    const { app } = await buildApp();
    const { recordSweepBroadcasted } = await import('../services/sweep-create.service.js');
    vi.mocked(recordSweepBroadcasted).mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: `/internal/sweeps/${SWEEP_ID}/broadcasted`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: { txHash: '0xabcdef1234' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(recordSweepBroadcasted).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns 404 when recordSweepBroadcasted throws SwNotFoundError', async () => {
    const { app } = await buildApp();
    const { recordSweepBroadcasted, NotFoundError } = await import(
      '../services/sweep-create.service.js'
    );
    vi.mocked(recordSweepBroadcasted).mockRejectedValue(new NotFoundError('sweep not found'));

    const res = await app.inject({
      method: 'POST',
      url: `/internal/sweeps/${SWEEP_ID}/broadcasted`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: { txHash: '0xabcdef' },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 401 without auth header', async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/internal/sweeps/${SWEEP_ID}/broadcasted`,
      headers: { 'content-type': 'application/json' },
      payload: { txHash: '0xabc' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ── POST /internal/sweeps/:id/confirmed ───────────────────────────────────────

describe('POST /internal/sweeps/:id/confirmed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('happy path — records sweep confirmed and returns ok=true', async () => {
    const { app } = await buildApp();
    const { recordSweepConfirmed } = await import('../services/sweep-create.service.js');
    vi.mocked(recordSweepConfirmed).mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: `/internal/sweeps/${SWEEP_ID}/confirmed`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(recordSweepConfirmed).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('fires notifyStaff after recording confirmation', async () => {
    const { app } = await buildApp();
    const { recordSweepConfirmed } = await import('../services/sweep-create.service.js');
    vi.mocked(recordSweepConfirmed).mockResolvedValue(undefined);

    const { notifyStaff } = await import('../services/notify-staff.service.js');

    const res = await app.inject({
      method: 'POST',
      url: `/internal/sweeps/${SWEEP_ID}/confirmed`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    // notifyStaff is fire-and-forget — may have been called
    expect(notifyStaff).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ eventType: 'sweep.confirmed', severity: 'info' }),
      expect.anything(),
      expect.anything()
    );
    await app.close();
  });

  it('returns 404 when recordSweepConfirmed throws SwNotFoundError', async () => {
    const { app } = await buildApp();
    const { recordSweepConfirmed, NotFoundError } = await import(
      '../services/sweep-create.service.js'
    );
    vi.mocked(recordSweepConfirmed).mockRejectedValue(new NotFoundError('sweep not found'));

    const res = await app.inject({
      method: 'POST',
      url: `/internal/sweeps/${SWEEP_ID}/confirmed`,
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 401 without auth header', async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/internal/sweeps/${SWEEP_ID}/confirmed`,
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
