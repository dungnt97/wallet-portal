import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for withdrawals.routes.ts — full CRUD + approve + execute + export
// Tests: GET /withdrawals, GET /withdrawals/export.csv, POST /withdrawals, POST /approve, POST /execute,
//        POST /reject, POST /submit, POST /cancel endpoints
// Uses Fastify inject + mocked DB/Queue/IO — no real Postgres or Socket.io
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks (must precede service imports) ───────────────────────────────

vi.mock('../services/withdrawal-create.service.js', () => ({
  createWithdrawal: vi.fn(),
  ValidationError: class ValidationError extends Error {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    constructor(m: string) {
      super(m);
      this.name = 'ValidationError';
    }
  },
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  PolicyRejectedError: class PolicyRejectedError extends Error {
    statusCode = 403;
    code = 'POLICY_REJECTED';
    constructor(
      m: string,
      public reasons?: Array<{ rule: string; message: string }>
    ) {
      super(m);
      this.name = 'PolicyRejectedError';
    }
  },
}));

vi.mock('../services/withdrawal-approve.service.js', () => ({
  approveWithdrawal: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {
    statusCode = 403;
    code = 'FORBIDDEN';
    constructor(m: string) {
      super(m);
      this.name = 'ForbiddenError';
    }
  },
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
  PolicyRejectedError: class PolicyRejectedError extends Error {
    statusCode = 403;
    code = 'POLICY_REJECTED';
    constructor(
      m: string,
      public reasons?: Array<{ rule: string; message: string }>
    ) {
      super(m);
      this.name = 'PolicyRejectedError';
    }
  },
}));

vi.mock('../services/withdrawal-execute.service.js', () => ({
  executeWithdrawal: vi.fn(),
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

vi.mock('../services/withdrawal-csv.service.js', () => ({
  countWithdrawalsForExport: vi.fn(),
  queryWithdrawalsForExport: vi.fn(),
  streamWithdrawalCsv: vi.fn(),
}));

vi.mock('../services/signing-session-verifier.js', () => ({
  verifySigningSession: vi.fn().mockReturnValue({ ok: true }),
}));

vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const BEARER = 'test-bearer';
const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const WD_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = '00000000-0000-0000-0000-000000000003';
const OP_ID = '00000000-0000-0000-0000-000000000004';

function makeEvmSession() {
  return {
    v: 1,
    kind: 'evm',
    safeAddress: '0x1234567890123456789012345678901234567890',
    chainId: 97, // BSC testnet
    safeTxHash: `0x${'0'.repeat(64)}`,
    domain: {
      name: 'Gnosis Safe',
      version: '1.4.1',
      chainId: 97,
      verifyingContract: '0x1234567890123456789012345678901234567890',
    },
    message: {
      to: '0x1234567890123456789012345678901234567890',
      value: '0',
      data: '0x',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '0',
    },
  };
}

async function buildApp(
  opts: {
    withdrawals?: Record<string, unknown>[];
    withdrawalById?: Record<string, unknown> | null;
    mockCreateFn?: (...args: unknown[]) => Promise<unknown>;
    mockApproveFn?: (...args: unknown[]) => Promise<unknown>;
    mockExecuteFn?: (...args: unknown[]) => Promise<unknown>;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Mock decorators — BEFORE registering routes
  const withdrawalList = opts.withdrawals ?? [
    {
      id: WD_ID,
      userId: USER_ID,
      chain: 'bnb',
      token: 'USDT',
      amount: '1000',
      destinationAddr: '0x123',
      status: 'pending',
      sourceTier: 'hot',
      multisigOpId: OP_ID,
      timeLockExpiresAt: null,
      createdBy: STAFF_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockDb = {
    query: {
      withdrawals: {
        findFirst: vi.fn().mockResolvedValue(opts.withdrawalById ?? null),
      },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(withdrawalList),
            }),
          }),
        }),
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(withdrawalList),
          }),
        }),
        orderBy: vi.fn().mockResolvedValue(withdrawalList),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };

  const mockQueue = {
    getJob: vi.fn().mockResolvedValue(null),
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  };
  const mockColdTimelockQueue = {
    getJob: vi.fn().mockResolvedValue({
      remove: vi.fn().mockResolvedValue(undefined),
    }),
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  };
  const mockIO = {
    of: vi.fn().mockReturnValue({
      emit: vi.fn(),
    }),
  };
  const mockEmailQueue = { add: vi.fn() };
  const mockSlackQueue = { add: vi.fn() };

  app.decorate('db', mockDb as never);
  app.decorate('queue', mockQueue as never);
  app.decorate('coldTimelockQueue', mockColdTimelockQueue as never);
  app.decorate('io', mockIO as never);
  app.decorate('emailQueue', mockEmailQueue as never);
  app.decorate('slackQueue', mockSlackQueue as never);

  // RBAC middleware — set admin role for all endpoints
  app.addHook('preHandler', async (req, reply) => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock requires loose typing for session
    req.session = { staff: { id: STAFF_ID, role: 'admin' } } as any;
  });

  // Setup service mocks AFTER app creation but BEFORE route registration
  const { createWithdrawal } = await import('../services/withdrawal-create.service.js');
  const { approveWithdrawal } = await import('../services/withdrawal-approve.service.js');
  const { executeWithdrawal } = await import('../services/withdrawal-execute.service.js');
  const { countWithdrawalsForExport, queryWithdrawalsForExport, streamWithdrawalCsv } =
    await import('../services/withdrawal-csv.service.js');

  vi.mocked(createWithdrawal).mockImplementation(
    opts.mockCreateFn ??
      (async (db, input) => ({
        withdrawal: {
          id: WD_ID,
          userId: USER_ID,
          chain: input.chain,
          token: input.token,
          amount: input.amount,
          destinationAddr: input.destinationAddr,
          status: 'pending',
          sourceTier: input.sourceTier,
          multisigOpId: OP_ID,
          timeLockExpiresAt: null,
          createdBy: STAFF_ID,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        multisigOp: {
          id: OP_ID,
          collectedSigs: 0,
          requiredSigs: 2,
          status: 'pending',
        },
      }))
  );

  vi.mocked(approveWithdrawal).mockImplementation(
    opts.mockApproveFn ??
      (async () => ({
        op: {
          id: OP_ID,
          collectedSigs: 1,
          requiredSigs: 2,
          status: 'pending',
        },
        progress: '1/2',
        thresholdMet: false,
      }))
  );

  vi.mocked(executeWithdrawal).mockImplementation(
    opts.mockExecuteFn ??
      (async () => ({
        jobId: `job-${Math.random().toString(36).slice(2)}`,
      }))
  );

  vi.mocked(countWithdrawalsForExport).mockResolvedValue(10);
  vi.mocked(queryWithdrawalsForExport).mockResolvedValue(withdrawalList);

  vi.mocked(streamWithdrawalCsv).mockImplementation((rows, chunk) => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock — row shape is dynamic
    const csv = `id,userId,amount\n${rows.map((r: any) => `${r.id},${r.userId},${r.amount}`).join('\n')}`;
    chunk(csv);
  });

  const { default: withdrawalsRoutes } = await import('../routes/withdrawals.routes.js');
  await app.register(withdrawalsRoutes);
  await app.ready();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /withdrawals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated list of withdrawals', async () => {
    const rows = [
      {
        id: WD_ID,
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        destinationAddr: '0x123',
        status: 'pending',
        sourceTier: 'hot',
        multisigOpId: OP_ID,
        timeLockExpiresAt: null,
        createdBy: STAFF_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const app = await buildApp({ withdrawals: rows });

    const res = await app.inject({
      method: 'GET',
      url: '/withdrawals?page=1&limit=20',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(WD_ID);
    expect(body.page).toBe(1);
    await app.close();
  });

  it('filters by status', async () => {
    const rows = [
      {
        id: WD_ID,
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        destinationAddr: '0x123',
        status: 'approved',
        sourceTier: 'cold',
        multisigOpId: OP_ID,
        timeLockExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        createdBy: STAFF_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const app = await buildApp({ withdrawals: rows });

    const res = await app.inject({
      method: 'GET',
      url: '/withdrawals?page=1&limit=20&status=approved',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].status).toBe('approved');
    await app.close();
  });

  it('returns empty list when no withdrawals', async () => {
    const app = await buildApp({ withdrawals: [] });

    const res = await app.inject({
      method: 'GET',
      url: '/withdrawals?page=1&limit=20',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    await app.close();
  });

  it('defaults to page=1, limit=20', async () => {
    const app = await buildApp({ withdrawals: [] });

    const res = await app.inject({
      method: 'GET',
      url: '/withdrawals',
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toBeDefined();
    await app.close();
  });
});

describe('GET /withdrawals/export.csv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles export request with filters', async () => {
    const { countWithdrawalsForExport, queryWithdrawalsForExport } = await import(
      '../services/withdrawal-csv.service.js'
    );
    const app = await buildApp({ withdrawals: [] });

    const res = await app.inject({
      method: 'GET',
      url: '/withdrawals/export.csv?chain=bnb&status=pending',
    });

    expect(res.statusCode).toBe(200);
    // Service mocks should have been called to count and query
    expect(vi.mocked(countWithdrawalsForExport)).toHaveBeenCalled();
    expect(vi.mocked(queryWithdrawalsForExport)).toHaveBeenCalled();
    await app.close();
  });

  it('rejects export when row count exceeds 50k cap', async () => {
    const { countWithdrawalsForExport } = await import('../services/withdrawal-csv.service.js');
    vi.mocked(countWithdrawalsForExport).mockResolvedValueOnce(60_000);

    const app = await buildApp({ withdrawals: [] });

    const res = await app.inject({
      method: 'GET',
      url: '/withdrawals/export.csv',
    });

    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('too_many_rows');
    expect(body.max).toBe(50_000);
    expect(body.found).toBe(60_000);
    await app.close();
  });

  it('filters export by date range', async () => {
    const { countWithdrawalsForExport } = await import('../services/withdrawal-csv.service.js');
    const app = await buildApp({ withdrawals: [] });

    const res = await app.inject({
      method: 'GET',
      url: '/withdrawals/export.csv?from=2026-04-01T00:00:00Z&to=2026-04-30T23:59:59Z',
    });

    expect(res.statusCode).toBe(200);
    // Verify service was called with filter params
    expect(vi.mocked(countWithdrawalsForExport)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        from: expect.any(String),
        to: expect.any(String),
      })
    );
    await app.close();
  });
});

describe('POST /withdrawals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates withdrawal with valid input', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/withdrawals',
      payload: {
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000.50',
        destinationAddr: '0x123abc',
        sourceTier: 'hot',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.withdrawal.id).toBe(WD_ID);
    expect(body.withdrawal.amount).toBe('1000.50');
    expect(body.multisigOpId).toBe(OP_ID);
    await app.close();
  });

  it('rejects invalid amount format with 400', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/withdrawals',
      payload: {
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: 'invalid', // Zod validates: must match ^\d+(\.\d+)?$
        destinationAddr: '0x123abc',
        sourceTier: 'hot',
      },
    });

    expect(res.statusCode).toBe(400); // Zod schema validation error
    await app.close();
  });

  it('returns 404 when user not found', async () => {
    const { NotFoundError } = await import('../services/withdrawal-create.service.js');
    const app = await buildApp({
      mockCreateFn: async () => {
        throw new NotFoundError('User not found');
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/withdrawals',
      payload: {
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        destinationAddr: '0x123abc',
        sourceTier: 'hot',
      },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 403 when policy rejects withdrawal', async () => {
    const { PolicyRejectedError } = await import('../services/withdrawal-create.service.js');
    const app = await buildApp({
      mockCreateFn: async () => {
        throw new PolicyRejectedError('Policy rejected', [
          { rule: 'daily_limit', message: 'Exceeds daily limit' },
        ]);
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/withdrawals',
      payload: {
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '999999',
        destinationAddr: '0x123abc',
        sourceTier: 'hot',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('POLICY_REJECTED');
    expect(body.reasons).toHaveLength(1);
    expect(body.reasons[0].rule).toBe('daily_limit');
    await app.close();
  });
});

describe('POST /withdrawals/:id/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approves withdrawal with valid signature', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/approve`,
      payload: {
        signature: '0xsig123',
        signerAddress: '0x123',
        signedAt: new Date().toISOString(),
        multisigOpId: OP_ID,
        chain: 'bnb',
        session: makeEvmSession(),
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.op.id).toBe(OP_ID);
    expect(body.op.collectedSigs).toBe(1);
    expect(body.op.requiredSigs).toBe(2);
    expect(body.thresholdMet).toBe(false);
    await app.close();
  });

  it('returns 400 when signature verification fails', async () => {
    const { verifySigningSession } = await import('../services/signing-session-verifier.js');
    vi.mocked(verifySigningSession).mockReturnValueOnce({
      ok: false,
      reason: 'Invalid challenge',
    });

    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/approve`,
      payload: {
        signature: '0xbad',
        signerAddress: '0x123',
        signedAt: new Date().toISOString(),
        multisigOpId: OP_ID,
        chain: 'bnb',
        session: makeEvmSession(),
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('INVALID_SIGNATURE');
    await app.close();
  });

  it('returns 404 when withdrawal not found', async () => {
    const { NotFoundError } = await import('../services/withdrawal-approve.service.js');
    const app = await buildApp({
      mockApproveFn: async () => {
        throw new NotFoundError('Withdrawal not found');
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/withdrawals/00000000-0000-0000-0000-000000000099/approve',
      payload: {
        signature: '0xsig123',
        signerAddress: '0x123',
        signedAt: new Date().toISOString(),
        multisigOpId: OP_ID,
        chain: 'bnb',
        session: makeEvmSession(),
      },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 409 when withdrawal already executed', async () => {
    const { ConflictError } = await import('../services/withdrawal-approve.service.js');
    const app = await buildApp({
      mockApproveFn: async () => {
        throw new ConflictError('Cannot approve executed withdrawal');
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/approve`,
      payload: {
        signature: '0xsig123',
        signerAddress: '0x123',
        signedAt: new Date().toISOString(),
        multisigOpId: OP_ID,
        chain: 'bnb',
        session: makeEvmSession(),
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('CONFLICT');
    await app.close();
  });

  it('returns 403 when policy rejects approval', async () => {
    const { PolicyRejectedError } = await import('../services/withdrawal-approve.service.js');
    const app = await buildApp({
      mockApproveFn: async () => {
        throw new PolicyRejectedError('Policy check failed', [
          { rule: 'compliance', message: 'Account under review' },
        ]);
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/approve`,
      payload: {
        signature: '0xsig123',
        signerAddress: '0x123',
        signedAt: new Date().toISOString(),
        multisigOpId: OP_ID,
        chain: 'bnb',
        session: makeEvmSession(),
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.reasons).toBeDefined();
    await app.close();
  });

  it('allows optional attestation blob and type', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/approve`,
      payload: {
        signature: '0xsig123',
        signerAddress: '0x123',
        signedAt: new Date().toISOString(),
        multisigOpId: OP_ID,
        chain: 'bnb',
        session: makeEvmSession(),
        // attestation fields are optional and omitted here — tests basic flow
      },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /withdrawals/:id/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues withdrawal for broadcast', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/execute`,
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.jobId).toMatch(/^job-/);
    await app.close();
  });

  it('returns 404 when withdrawal not found', async () => {
    const { NotFoundError } = await import('../services/withdrawal-execute.service.js');
    const app = await buildApp({
      mockExecuteFn: async () => {
        throw new NotFoundError('Withdrawal not found');
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/withdrawals/00000000-0000-0000-0000-000000000099/execute',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 409 when withdrawal already executing', async () => {
    const { ConflictError } = await import('../services/withdrawal-execute.service.js');
    const app = await buildApp({
      mockExecuteFn: async () => {
        throw new ConflictError('Withdrawal already executing');
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/execute`,
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('CONFLICT');
    await app.close();
  });
});

describe('POST /withdrawals/:id/reject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects pending withdrawal', async () => {
    const withdrawal = {
      id: WD_ID,
      status: 'pending',
      amount: '1000',
    };
    const app = await buildApp({ withdrawalById: withdrawal });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/reject`,
      payload: { reason: 'Suspicious activity' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    await app.close();
  });

  it('returns 404 when withdrawal not found', async () => {
    const app = await buildApp({ withdrawalById: null });

    const res = await app.inject({
      method: 'POST',
      url: '/withdrawals/00000000-0000-0000-0000-000000000099/reject',
      payload: { reason: 'Test' },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 409 when withdrawal not in rejectable status', async () => {
    const withdrawal = {
      id: WD_ID,
      status: 'completed',
      amount: '1000',
    };
    const app = await buildApp({ withdrawalById: withdrawal });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/reject`,
      payload: { reason: 'Too late' },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('CONFLICT');
    expect(body.message).toMatch(/Cannot reject/);
    await app.close();
  });

  it('rejects approved withdrawals', async () => {
    const withdrawal = {
      id: WD_ID,
      status: 'approved',
      amount: '1000',
    };
    const app = await buildApp({ withdrawalById: withdrawal });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/reject`,
      payload: { reason: 'Changed mind' },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('rejects time_locked withdrawals', async () => {
    const withdrawal = {
      id: WD_ID,
      status: 'time_locked',
      amount: '1000',
    };
    const app = await buildApp({ withdrawalById: withdrawal });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/reject`,
      payload: { reason: 'Emergency' },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /withdrawals/:id/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits pending withdrawal for multisig', async () => {
    const withdrawal = {
      id: WD_ID,
      status: 'pending',
      amount: '1000',
    };
    const app = await buildApp({ withdrawalById: withdrawal });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/submit`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('pending');
    await app.close();
  });

  it('returns 404 when withdrawal not found', async () => {
    const app = await buildApp({ withdrawalById: null });

    const res = await app.inject({
      method: 'POST',
      url: '/withdrawals/00000000-0000-0000-0000-000000000099/submit',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 409 when withdrawal not in pending status', async () => {
    const withdrawal = {
      id: WD_ID,
      status: 'approved',
      amount: '1000',
    };
    const app = await buildApp({ withdrawalById: withdrawal });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/submit`,
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('CONFLICT');
    expect(body.message).toMatch(/only pending/);
    await app.close();
  });
});

describe('POST /withdrawals/:id/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels pending withdrawal', async () => {
    const withdrawal = {
      id: WD_ID,
      status: 'pending',
      amount: '1000',
    };
    const app = await buildApp({ withdrawalById: withdrawal });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/cancel`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    await app.close();
  });

  it('removes cold-timelock job when cancelling', async () => {
    const withdrawal = {
      id: WD_ID,
      status: 'time_locked',
      amount: '1000',
    };
    const app = await buildApp({ withdrawalById: withdrawal });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/cancel`,
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 404 when withdrawal not found', async () => {
    const app = await buildApp({ withdrawalById: null });

    const res = await app.inject({
      method: 'POST',
      url: '/withdrawals/00000000-0000-0000-0000-000000000099/cancel',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 409 when withdrawal not cancellable', async () => {
    const withdrawal = {
      id: WD_ID,
      status: 'completed',
      amount: '1000',
    };
    const app = await buildApp({ withdrawalById: withdrawal });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/cancel`,
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('CONFLICT');
    await app.close();
  });

  it('cancels approved withdrawals', async () => {
    const withdrawal = {
      id: WD_ID,
      status: 'approved',
      amount: '1000',
    };
    const app = await buildApp({ withdrawalById: withdrawal });

    const res = await app.inject({
      method: 'POST',
      url: `/withdrawals/${WD_ID}/cancel`,
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
