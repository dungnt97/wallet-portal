import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for multisig.routes.ts
// Tests: GET /multisig-ops, POST /multisig-ops/:id/submit-signature,
//        POST /multisig-ops/:id/approve, POST /multisig-ops/:id/reject,
//        POST /multisig-ops/:id/execute
// Uses Fastify inject + mocked DB/services — no real Postgres
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/signing-session-verifier.js', () => ({
  verifySigningSession: vi.fn().mockReturnValue({ ok: true }),
}));

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/withdrawal-execute.service.js', () => ({
  executeWithdrawal: vi.fn(),
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class ConflictError extends Error {
    code = 'CONFLICT';
    statusCode = 409;
    constructor(m: string) {
      super(m);
      this.name = 'ConflictError';
    }
  },
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const OP_ID = '00000000-0000-0000-0000-000000000002';
const WITHDRAWAL_ID = '00000000-0000-0000-0000-000000000003';
const SIGNING_KEY_ID = '00000000-0000-0000-0000-000000000004';
const APPROVAL_ID = '00000000-0000-0000-0000-000000000005';

function makeOp(overrides: Record<string, unknown> = {}) {
  return {
    id: OP_ID,
    withdrawalId: null as string | null,
    chain: 'bnb' as const,
    operationType: 'withdrawal' as const,
    multisigAddr: '0xMultisig',
    requiredSigs: 2,
    collectedSigs: 0,
    status: 'pending' as const,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000), // 24h from now
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

function makeSigningKey(overrides: Record<string, unknown> = {}) {
  return {
    id: SIGNING_KEY_ID,
    staffId: STAFF_ID,
    chain: 'bnb' as const,
    address: '0xSignerAddr',
    tier: 'hot' as const,
    walletType: 'metamask' as const,
    hwAttested: false,
    registeredAt: new Date('2026-01-01T00:00:00Z'),
    revokedAt: null,
    ...overrides,
  };
}

function makeEvmSession() {
  return {
    v: 1,
    kind: 'evm' as const,
    safeAddress: '0x1234567890123456789012345678901234567890',
    chainId: 97,
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
    opById?: Record<string, unknown> | null;
    signingKeyById?: Record<string, unknown> | null;
    existingApproval?: Record<string, unknown> | null;
    opsListRows?: Array<{ op: Record<string, unknown>; w: Record<string, unknown> | null }>;
    signerCounts?: Array<{ chain: string; total: number }>;
    updatedOp?: Record<string, unknown> | null;
    executeWithdrawalFn?: (...args: unknown[]) => Promise<unknown>;
    verifySessionResult?: { ok: boolean; reason?: string };
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const baseOp = makeOp();
  const resolvedOp = opts.opById === undefined ? baseOp : opts.opById;

  // Updated op returned from .update().where().returning()
  const updatedOpRow =
    opts.updatedOp === undefined
      ? { ...baseOp, collectedSigs: 1, status: 'collecting' }
      : opts.updatedOp;

  const opsListRows = opts.opsListRows ?? [
    {
      op: baseOp,
      w: { amount: '1000', token: 'USDT', destinationAddr: '0xDest', nonce: 1 },
    },
  ];

  const signerCounts = opts.signerCounts ?? [{ chain: 'bnb', total: 3 }];

  // Track select calls to handle both ops-list and signerCounts queries
  let selectCallIdx = 0;
  const mockSelect = vi.fn(() => {
    selectCallIdx++;
    if (selectCallIdx % 2 === 0) {
      // signerCounts query
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(signerCounts),
          }),
        }),
      };
    }
    // ops list query with LEFT JOIN
    return {
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(opsListRows),
              }),
            }),
          }),
        }),
      }),
    };
  });

  const mockDb = {
    query: {
      multisigOperations: {
        findFirst: vi.fn().mockResolvedValue(resolvedOp),
      },
      staffSigningKeys: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            opts.signingKeyById === undefined ? makeSigningKey() : opts.signingKeyById
          ),
      },
      multisigApprovals: {
        findFirst: vi
          .fn()
          .mockResolvedValue(opts.existingApproval === undefined ? null : opts.existingApproval),
      },
    },
    select: mockSelect,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(updatedOpRow ? [updatedOpRow] : []),
        }),
      }),
    }),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
      const fakeTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue(updatedOpRow ? [updatedOpRow] : []),
            }),
          }),
        }),
      };
      await cb(fakeTx);
    }),
  };

  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const mockIO = {
    of: vi.fn().mockReturnValue({ emit: vi.fn() }),
  };

  app.decorate('db', mockDb as never);
  app.decorate('queue', mockQueue as never);
  app.decorate('io', mockIO as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  // Apply verifySigningSession mock
  const { verifySigningSession } = await import('../services/signing-session-verifier.js');
  if (opts.verifySessionResult) {
    vi.mocked(verifySigningSession).mockReturnValue(opts.verifySessionResult as { ok: true });
  } else {
    vi.mocked(verifySigningSession).mockReturnValue({ ok: true });
  }

  // Apply executeWithdrawal mock
  const { executeWithdrawal } = await import('../services/withdrawal-execute.service.js');
  vi.mocked(executeWithdrawal).mockImplementation(
    opts.executeWithdrawalFn ?? (async () => ({ jobId: 'job-exec-1' }))
  );

  const { default: multisigRoutes } = await import('../routes/multisig.routes.js');
  await app.register(multisigRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /multisig-ops ──────────────────────────────────────────────────

describe('GET /multisig-ops', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated list of multisig ops', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/multisig-ops?page=1&limit=20' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(OP_ID);
    expect(body.page).toBe(1);
    await app.close();
  });

  it('includes withdrawal info when op has withdrawalId', async () => {
    const app = await buildApp({
      opsListRows: [
        {
          op: makeOp({ withdrawalId: WITHDRAWAL_ID }),
          w: { amount: '2000', token: 'USDC', destinationAddr: '0xRecipient', nonce: 5 },
        },
      ],
    });
    const res = await app.inject({ method: 'GET', url: '/multisig-ops' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].withdrawalAmount).toBe('2000');
    expect(body.data[0].withdrawalToken).toBe('USDC');
    await app.close();
  });

  it('sets totalSigners from signer counts', async () => {
    const app = await buildApp({ signerCounts: [{ chain: 'bnb', total: 5 }] });
    const res = await app.inject({ method: 'GET', url: '/multisig-ops' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].totalSigners).toBe(5);
    await app.close();
  });

  it('filters by status param', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/multisig-ops?status=pending' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 400 for invalid status', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/multisig-ops?status=invalid_status' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: POST /multisig-ops/:id/submit-signature ────────────────────────────

describe('POST /multisig-ops/:id/submit-signature', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submits signature and updates op', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/submit-signature`,
      payload: {
        signature: '0xsig',
        signerAddress: '0xSignerAddr',
        session: makeEvmSession(),
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.op.id).toBeDefined();
    expect(body.progress).toMatch(/\d+\/\d+/);
    await app.close();
  });

  it('returns 404 when op not found', async () => {
    const app = await buildApp({ opById: null });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/submit-signature`,
      payload: {
        signature: '0xsig',
        signerAddress: '0xSignerAddr',
        session: makeEvmSession(),
      },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 409 when op already ready', async () => {
    const app = await buildApp({ opById: makeOp({ status: 'ready' }) });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/submit-signature`,
      payload: {
        signature: '0xsig',
        signerAddress: '0xSignerAddr',
        session: makeEvmSession(),
      },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('returns 409 when op expired', async () => {
    const app = await buildApp({
      opById: makeOp({ status: 'pending', expiresAt: new Date(Date.now() - 1000) }),
    });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/submit-signature`,
      payload: {
        signature: '0xsig',
        signerAddress: '0xSignerAddr',
        session: makeEvmSession(),
      },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('returns 400 when signature verification fails', async () => {
    const app = await buildApp({
      verifySessionResult: { ok: false, reason: 'signature mismatch' },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/submit-signature`,
      payload: {
        signature: '0xbadsig',
        signerAddress: '0xSignerAddr',
        session: makeEvmSession(),
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('INVALID_SIGNATURE');
    await app.close();
  });

  it('returns 404 when signing key not found for staff+chain+address', async () => {
    const app = await buildApp({ signingKeyById: null });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/submit-signature`,
      payload: {
        signature: '0xsig',
        signerAddress: '0xUnknownAddr',
        session: makeEvmSession(),
      },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 409 when staff already signed this op', async () => {
    const app = await buildApp({
      existingApproval: { id: APPROVAL_ID, opId: OP_ID, staffSigningKeyId: SIGNING_KEY_ID },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/submit-signature`,
      payload: {
        signature: '0xsig',
        signerAddress: '0xSignerAddr',
        session: makeEvmSession(),
      },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('CONFLICT');
    await app.close();
  });
});

// ── Tests: POST /multisig-ops/:id/approve ────────────────────────────────────

describe('POST /multisig-ops/:id/approve', () => {
  beforeEach(() => vi.clearAllMocks());

  it('approves op and returns updated state', async () => {
    const app = await buildApp({
      updatedOp: makeOp({ collectedSigs: 1, status: 'collecting' }),
    });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/approve`,
      payload: { staffId: STAFF_ID },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.op).toBeDefined();
    expect(typeof body.thresholdMet).toBe('boolean');
    await app.close();
  });

  it('returns 404 when op not found', async () => {
    const app = await buildApp({ opById: null });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/approve`,
      payload: { staffId: STAFF_ID },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 409 when op in terminal status', async () => {
    for (const status of ['submitted', 'confirmed', 'failed', 'expired']) {
      const app = await buildApp({ opById: makeOp({ status }) });
      const res = await app.inject({
        method: 'POST',
        url: `/multisig-ops/${OP_ID}/approve`,
        payload: { staffId: STAFF_ID },
      });
      expect(res.statusCode).toBe(409);
      await app.close();
    }
  });

  it('sets thresholdMet=true when count reaches required', async () => {
    const app = await buildApp({
      opById: makeOp({ collectedSigs: 1, requiredSigs: 2 }),
      updatedOp: makeOp({ collectedSigs: 2, requiredSigs: 2, status: 'ready' }),
    });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/approve`,
      payload: { staffId: STAFF_ID },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.thresholdMet).toBe(true);
    await app.close();
  });
});

// ── Tests: POST /multisig-ops/:id/reject ─────────────────────────────────────

describe('POST /multisig-ops/:id/reject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects op and returns ok=true', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/reject`,
      payload: { reason: 'Fraudulent transaction' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    await app.close();
  });

  it('returns 404 when op not found', async () => {
    const app = await buildApp({ opById: null });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/reject`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 409 when op already submitted/confirmed', async () => {
    for (const status of ['submitted', 'confirmed', 'failed', 'expired']) {
      const app = await buildApp({ opById: makeOp({ status }) });
      const res = await app.inject({
        method: 'POST',
        url: `/multisig-ops/${OP_ID}/reject`,
        payload: {},
      });
      expect(res.statusCode).toBe(409);
      await app.close();
    }
  });

  it('works with empty body (reason optional)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/reject`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ── Tests: POST /multisig-ops/:id/execute ────────────────────────────────────

describe('POST /multisig-ops/:id/execute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes non-withdrawal op and returns 202', async () => {
    const app = await buildApp({ opById: makeOp({ status: 'ready', withdrawalId: null }) });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/execute`,
    });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.jobId).toContain(OP_ID);
    await app.close();
  });

  it('delegates to executeWithdrawal when op has withdrawalId', async () => {
    const app = await buildApp({
      opById: makeOp({ status: 'ready', withdrawalId: WITHDRAWAL_ID }),
      executeWithdrawalFn: async () => ({ jobId: 'job-wd-123' }),
    });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/execute`,
    });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBe('job-wd-123');
    await app.close();
  });

  it('returns 404 when op not found', async () => {
    const app = await buildApp({ opById: null });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/execute`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 409 when op not ready', async () => {
    for (const status of ['pending', 'collecting', 'submitted', 'confirmed']) {
      const app = await buildApp({ opById: makeOp({ status }) });
      const res = await app.inject({
        method: 'POST',
        url: `/multisig-ops/${OP_ID}/execute`,
      });
      expect(res.statusCode).toBe(409);
      await app.close();
    }
  });

  it('propagates NOT_FOUND from executeWithdrawal as 404', async () => {
    const app = await buildApp({
      opById: makeOp({ status: 'ready', withdrawalId: WITHDRAWAL_ID }),
      executeWithdrawalFn: async () => {
        const err = new Error('Withdrawal not found');
        (err as { code?: string }).code = 'NOT_FOUND';
        throw err;
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/execute`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('propagates CONFLICT from executeWithdrawal as 409', async () => {
    const app = await buildApp({
      opById: makeOp({ status: 'ready', withdrawalId: WITHDRAWAL_ID }),
      executeWithdrawalFn: async () => {
        const err = new Error('Already submitted');
        (err as { code?: string }).code = 'CONFLICT';
        throw err;
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/multisig-ops/${OP_ID}/execute`,
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});
