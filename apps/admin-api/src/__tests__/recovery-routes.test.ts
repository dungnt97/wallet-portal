import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for recovery.routes.ts
// Tests: GET /recovery/stuck, POST /recovery/:entityType/:entityId/bump,
//        POST /recovery/:entityType/:entityId/cancel
// Tests recovery-disabled 503, all error class mappings, success paths
// Uses Fastify inject + mocked services — no real Postgres
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/recovery-stuck-scanner.service.js', () => ({
  listStuckTxs: vi.fn(),
}));

vi.mock('../services/recovery-bump.service.js', () => ({
  bumpTx: vi.fn(),
  RecoveryDisabledError: class RecoveryDisabledError extends Error {
    code = 'RECOVERY_DISABLED';
    constructor(m: string) {
      super(m);
      this.name = 'RecoveryDisabledError';
    }
  },
  ColdTierNotSupportedError: class ColdTierNotSupportedError extends Error {
    code = 'COLD_TIER_NOT_SUPPORTED';
    constructor(m: string) {
      super(m);
      this.name = 'ColdTierNotSupportedError';
    }
  },
  RebalanceNotSupportedError: class RebalanceNotSupportedError extends Error {
    code = 'REBALANCE_NOT_SUPPORTED';
    constructor(m: string) {
      super(m);
      this.name = 'RebalanceNotSupportedError';
    }
  },
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    constructor(m: string) {
      super(m);
      this.name = 'NotFoundError';
    }
  },
  AlreadyFinalError: class AlreadyFinalError extends Error {
    code = 'ALREADY_FINAL';
    constructor(m: string) {
      super(m);
      this.name = 'AlreadyFinalError';
    }
  },
  BumpRateLimitError: class BumpRateLimitError extends Error {
    code = 'BUMP_RATE_LIMIT';
    constructor(m: string) {
      super(m);
      this.name = 'BumpRateLimitError';
    }
  },
  GasOracleError: class GasOracleError extends Error {
    code = 'GAS_ORACLE_ERROR';
    constructor(m: string) {
      super(m);
      this.name = 'GasOracleError';
    }
  },
}));

vi.mock('../services/recovery-cancel.service.js', () => ({
  cancelTx: vi.fn(),
  SolanaCannotCancelError: class SolanaCannotCancelError extends Error {
    code = 'SOLANA_CANNOT_CANCEL';
    remedy = 'Use bump instead';
    constructor(m: string) {
      super(m);
      this.name = 'SolanaCannotCancelError';
    }
  },
}));

vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const ENTITY_ID = '00000000-0000-0000-0000-000000000002';
const ACTION_ID = '00000000-0000-0000-0000-000000000003';

function makeStuckItem(overrides: Record<string, unknown> = {}) {
  return {
    entityType: 'withdrawal' as const,
    entityId: ENTITY_ID,
    txHash: '0xabc',
    chain: 'bnb' as const,
    broadcastAt: '2026-01-01T00:00:00.000Z',
    ageSeconds: 900,
    bumpCount: 0,
    lastBumpAt: null,
    canBump: true,
    canCancel: true,
    ...overrides,
  };
}

async function buildApp(
  opts: {
    listStuckFn?: (...args: unknown[]) => Promise<unknown>;
    bumpTxFn?: (...args: unknown[]) => Promise<unknown>;
    cancelTxFn?: (...args: unknown[]) => Promise<unknown>;
    recoveryEnabled?: boolean;
  } = {}
) {
  // Control RECOVERY_ENABLED env before app creation
  if (opts.recoveryEnabled === false) {
    process.env.RECOVERY_ENABLED = 'false';
  } else {
    process.env.RECOVERY_ENABLED = undefined;
  }

  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('db', {} as never);
  app.decorate('io', { of: vi.fn().mockReturnValue({ emit: vi.fn() }) } as never);
  app.decorate('emailQueue', { add: vi.fn() } as never);
  app.decorate('slackQueue', { add: vi.fn() } as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { listStuckTxs } = await import('../services/recovery-stuck-scanner.service.js');
  const { bumpTx } = await import('../services/recovery-bump.service.js');
  const { cancelTx } = await import('../services/recovery-cancel.service.js');

  vi.mocked(listStuckTxs).mockImplementation(
    opts.listStuckFn ??
      (async () => ({
        items: [makeStuckItem()],
        thresholdsUsed: { evmMinutes: 10, solanaSeconds: 60 },
      }))
  );

  vi.mocked(bumpTx).mockImplementation(
    opts.bumpTxFn ??
      (async () => ({
        ok: true,
        actionId: ACTION_ID,
        newTxHash: '0xnewbumped',
        bumpCount: 1,
      }))
  );

  vi.mocked(cancelTx).mockImplementation(
    opts.cancelTxFn ??
      (async () => ({
        ok: true,
        actionId: ACTION_ID,
        cancelTxHash: '0xcanceltx',
      }))
  );

  const { default: recoveryRoutes } = await import('../routes/recovery.routes.js');
  await app.register(recoveryRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /recovery/stuck ────────────────────────────────────────────────

describe('GET /recovery/stuck', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => {
    process.env.RECOVERY_ENABLED = undefined;
  });

  it('returns stuck transactions', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/recovery/stuck' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].entityId).toBe(ENTITY_ID);
    expect(body.thresholdsUsed).toBeDefined();
    await app.close();
  });

  it('returns 503 when recovery is disabled', async () => {
    const app = await buildApp({ recoveryEnabled: false });
    const res = await app.inject({ method: 'GET', url: '/recovery/stuck' });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('RECOVERY_DISABLED');
    await app.close();
  });

  it('filters by entityType=withdrawal', async () => {
    const items = [
      makeStuckItem({ entityType: 'withdrawal' }),
      makeStuckItem({ entityType: 'sweep' }),
    ];
    const app = await buildApp({
      listStuckFn: async () => ({
        items,
        thresholdsUsed: { evmMinutes: 10, solanaSeconds: 60 },
      }),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/recovery/stuck?entityType=withdrawal',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items.every((i: { entityType: string }) => i.entityType === 'withdrawal')).toBe(
      true
    );
    await app.close();
  });

  it('returns all items when entityType=all', async () => {
    const items = [
      makeStuckItem({ entityType: 'withdrawal' }),
      makeStuckItem({ entityType: 'sweep' }),
    ];
    const app = await buildApp({
      listStuckFn: async () => ({
        items,
        thresholdsUsed: { evmMinutes: 10, solanaSeconds: 60 },
      }),
    });
    const res = await app.inject({ method: 'GET', url: '/recovery/stuck?entityType=all' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(2);
    await app.close();
  });

  it('returns 400 for invalid entityType', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/recovery/stuck?entityType=deposit',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: POST /recovery/:entityType/:entityId/bump ─────────────────────────

describe('POST /recovery/:entityType/:entityId/bump', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bumps a stuck withdrawal', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/bump`,
      payload: { idempotencyKey: 'idem-key-123' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.actionId).toBe(ACTION_ID);
    expect(body.newTxHash).toBe('0xnewbumped');
    await app.close();
  });

  it('bumps a stuck sweep', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/sweep/${ENTITY_ID}/bump`,
      payload: { idempotencyKey: 'idem-sweep-456' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    await app.close();
  });

  it('returns 503 on RecoveryDisabledError', async () => {
    const { RecoveryDisabledError } = await import('../services/recovery-bump.service.js');
    const app = await buildApp({
      bumpTxFn: async () => {
        throw new RecoveryDisabledError('disabled');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/bump`,
      payload: { idempotencyKey: 'key' },
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe('RECOVERY_DISABLED');
    await app.close();
  });

  it('returns 403 on ColdTierNotSupportedError', async () => {
    const { ColdTierNotSupportedError } = await import('../services/recovery-bump.service.js');
    const app = await buildApp({
      bumpTxFn: async () => {
        throw new ColdTierNotSupportedError('cold tier');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/bump`,
      payload: { idempotencyKey: 'key' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 on NotFoundError', async () => {
    const { NotFoundError } = await import('../services/recovery-bump.service.js');
    const app = await buildApp({
      bumpTxFn: async () => {
        throw new NotFoundError('entity not found');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/bump`,
      payload: { idempotencyKey: 'key' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 409 on AlreadyFinalError', async () => {
    const { AlreadyFinalError } = await import('../services/recovery-bump.service.js');
    const app = await buildApp({
      bumpTxFn: async () => {
        throw new AlreadyFinalError('already confirmed');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/bump`,
      payload: { idempotencyKey: 'key' },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('returns 429 on BumpRateLimitError', async () => {
    const { BumpRateLimitError } = await import('../services/recovery-bump.service.js');
    const app = await buildApp({
      bumpTxFn: async () => {
        throw new BumpRateLimitError('max bumps reached');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/bump`,
      payload: { idempotencyKey: 'key' },
    });
    expect(res.statusCode).toBe(429);
    await app.close();
  });

  it('returns 503 on GasOracleError', async () => {
    const { GasOracleError } = await import('../services/recovery-bump.service.js');
    const app = await buildApp({
      bumpTxFn: async () => {
        throw new GasOracleError('oracle down');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/bump`,
      payload: { idempotencyKey: 'key' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 400 for invalid entityType', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/deposit/${ENTITY_ID}/bump`,
      payload: { idempotencyKey: 'key' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: POST /recovery/:entityType/:entityId/cancel ────────────────────────

describe('POST /recovery/:entityType/:entityId/cancel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels a stuck withdrawal', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/cancel`,
      payload: { idempotencyKey: 'cancel-key-abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.actionId).toBe(ACTION_ID);
    expect(body.cancelTxHash).toBe('0xcanceltx');
    await app.close();
  });

  it('returns 410 on SolanaCannotCancelError', async () => {
    const { SolanaCannotCancelError } = await import('../services/recovery-cancel.service.js');
    const app = await buildApp({
      cancelTxFn: async () => {
        throw new SolanaCannotCancelError('solana does not support cancel');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/sweep/${ENTITY_ID}/cancel`,
      payload: { idempotencyKey: 'key' },
    });
    expect(res.statusCode).toBe(410);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('SOLANA_CANNOT_CANCEL');
    expect(body.remedy).toBeDefined();
    await app.close();
  });

  it('returns 503 on RecoveryDisabledError from cancelTx', async () => {
    const { RecoveryDisabledError } = await import('../services/recovery-bump.service.js');
    const app = await buildApp({
      cancelTxFn: async () => {
        throw new RecoveryDisabledError('disabled');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/cancel`,
      payload: { idempotencyKey: 'key' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns 403 on ColdTierNotSupportedError from cancelTx', async () => {
    const { ColdTierNotSupportedError } = await import('../services/recovery-bump.service.js');
    const app = await buildApp({
      cancelTxFn: async () => {
        throw new ColdTierNotSupportedError('cold tier');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/cancel`,
      payload: { idempotencyKey: 'key' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 on NotFoundError from cancelTx', async () => {
    const { NotFoundError } = await import('../services/recovery-bump.service.js');
    const app = await buildApp({
      cancelTxFn: async () => {
        throw new NotFoundError('not found');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/cancel`,
      payload: { idempotencyKey: 'key' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 409 on AlreadyFinalError from cancelTx', async () => {
    const { AlreadyFinalError } = await import('../services/recovery-bump.service.js');
    const app = await buildApp({
      cancelTxFn: async () => {
        throw new AlreadyFinalError('already final');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/cancel`,
      payload: { idempotencyKey: 'key' },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('returns 400 for missing idempotencyKey', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/cancel`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
