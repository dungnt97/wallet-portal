import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for rebalance.routes.ts
// Tests: GET /rebalance/history, POST /rebalance
// Uses Fastify inject + mocked DB + rebalance-create service
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/rebalance-create.service.js', () => ({
  createRebalance: vi.fn(),
  KillSwitchEnabledError: class KillSwitchEnabledError extends Error {
    code = 'KILL_SWITCH_ENABLED';
    constructor(m: string) {
      super(m);
      this.name = 'KillSwitchEnabledError';
    }
  },
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  PolicyRejectedError: class PolicyRejectedError extends Error {
    code = 'POLICY_REJECTED';
    reasons: Array<{ rule: string; message: string }>;
    constructor(m: string, reasons: Array<{ rule: string; message: string }> = []) {
      super(m);
      this.name = 'PolicyRejectedError';
      this.reasons = reasons;
    }
  },
  ValidationError: class ValidationError extends Error {
    code = 'VALIDATION_ERROR';
    constructor(m: string) {
      super(m);
      this.name = 'ValidationError';
    }
  },
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const WD_ID = '00000000-0000-0000-0000-000000000002';
const MULTISIG_OP_ID = '00000000-0000-0000-0000-000000000003';

function makeHistoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WD_ID,
    chain: 'bnb' as const,
    sourceTier: 'hot' as const,
    amount: '50000.000000000000000000',
    createdAt: new Date('2026-01-15T10:00:00Z'),
    broadcastAt: new Date('2026-01-15T10:05:00Z'),
    status: 'completed' as const,
    txHash: '0xabc',
    createdBy: STAFF_ID,
    multisigOpId: MULTISIG_OP_ID,
    collectedSigs: 3,
    operationType: 'hot_to_cold' as const,
    ...overrides,
  };
}

async function buildApp(
  opts: {
    historyRows?: Record<string, unknown>[];
    createRebalanceFn?: (...args: unknown[]) => Promise<unknown>;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const historyRows = opts.historyRows ?? [makeHistoryRow()];

  // select().from().leftJoin().where().orderBy().limit() chain for GET /rebalance/history
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(historyRows),
          }),
        }),
      }),
    }),
  });

  app.decorate('db', { select: mockSelect } as never);
  app.decorate('io', { of: vi.fn().mockReturnValue({ emit: vi.fn() }) } as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { createRebalance } = await import('../services/rebalance-create.service.js');
  vi.mocked(createRebalance).mockImplementation(
    opts.createRebalanceFn ??
      (async () => ({
        withdrawal: { id: WD_ID, status: 'pending' },
        multisigOp: { id: MULTISIG_OP_ID },
        destinationAddr: '0xColdVault',
      }))
  );

  const { default: rebalanceRoutes } = await import('../routes/rebalance.routes.js');
  await app.register(rebalanceRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /rebalance/history ─────────────────────────────────────────────

describe('GET /rebalance/history', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated rebalance history', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/rebalance/history' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(WD_ID);
    await app.close();
  });

  it('maps sourceTier=hot to hot→cold direction', async () => {
    const app = await buildApp({ historyRows: [makeHistoryRow({ sourceTier: 'hot' })] });
    const res = await app.inject({ method: 'GET', url: '/rebalance/history' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data[0].direction).toBe('hot→cold');
    await app.close();
  });

  it('maps sourceTier=cold to cold→hot direction', async () => {
    const app = await buildApp({ historyRows: [makeHistoryRow({ sourceTier: 'cold' })] });
    const res = await app.inject({ method: 'GET', url: '/rebalance/history' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data[0].direction).toBe('cold→hot');
    await app.close();
  });

  it('maps status=failed to failed', async () => {
    const app = await buildApp({ historyRows: [makeHistoryRow({ status: 'failed' })] });
    const res = await app.inject({ method: 'GET', url: '/rebalance/history' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data[0].status).toBe('failed');
    await app.close();
  });

  it('maps status=pending to awaiting_signatures', async () => {
    const app = await buildApp({
      historyRows: [makeHistoryRow({ status: 'pending', broadcastAt: null })],
    });
    const res = await app.inject({ method: 'GET', url: '/rebalance/history' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data[0].status).toBe('awaiting_signatures');
    await app.close();
  });

  it('serialises dates to ISO strings', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/rebalance/history' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data[0].executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });

  it('returns empty array when no history', async () => {
    const app = await buildApp({ historyRows: [] });
    const res = await app.inject({ method: 'GET', url: '/rebalance/history' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual([]);
    await app.close();
  });
});

// ── Tests: POST /rebalance ────────────────────────────────────────────────────

describe('POST /rebalance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('initiates hot→cold rebalance and returns 201', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/rebalance',
      payload: { chain: 'bnb', token: 'USDT', amountMinor: '50000.00', direction: 'hot_to_cold' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.withdrawalId).toBe(WD_ID);
    expect(body.multisigOpId).toBe(MULTISIG_OP_ID);
    expect(body.destinationAddr).toBe('0xColdVault');
    await app.close();
  });

  it('returns 403 on PolicyRejectedError', async () => {
    const { PolicyRejectedError } = await import('../services/rebalance-create.service.js');
    const app = await buildApp({
      createRebalanceFn: async () => {
        throw new PolicyRejectedError('policy rejected', [
          { rule: 'max_amount', message: 'too large' },
        ]);
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/rebalance',
      payload: { chain: 'bnb', token: 'USDT', amountMinor: '999999.00' },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('POLICY_REJECTED');
    expect(Array.isArray(body.reasons)).toBe(true);
    await app.close();
  });

  it('returns 404 on NotFoundError', async () => {
    const { NotFoundError } = await import('../services/rebalance-create.service.js');
    const app = await buildApp({
      createRebalanceFn: async () => {
        throw new NotFoundError('wallet not found');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/rebalance',
      payload: { chain: 'bnb', token: 'USDT', amountMinor: '100.00' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 422 on ValidationError', async () => {
    const { ValidationError } = await import('../services/rebalance-create.service.js');
    const app = await buildApp({
      createRebalanceFn: async () => {
        throw new ValidationError('invalid amount');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/rebalance',
      payload: { chain: 'bnb', token: 'USDT', amountMinor: '0.00' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('returns 503 on KillSwitchEnabledError', async () => {
    const { KillSwitchEnabledError } = await import('../services/rebalance-create.service.js');
    const app = await buildApp({
      createRebalanceFn: async () => {
        throw new KillSwitchEnabledError('system paused');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/rebalance',
      payload: { chain: 'bnb', token: 'USDT', amountMinor: '1000.00' },
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe('KILL_SWITCH_ENABLED');
    await app.close();
  });

  it('returns 400 for invalid chain', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/rebalance',
      payload: { chain: 'eth', token: 'USDT', amountMinor: '100.00' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 for missing required fields', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/rebalance',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
