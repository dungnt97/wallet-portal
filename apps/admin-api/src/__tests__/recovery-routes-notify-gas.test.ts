import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Supplemental recovery-routes tests covering lines not hit by recovery-routes.test.ts:
//   - makeNotify closure invocation (lines 109-123 for bump, 201-215 for cancel)
//   - GasOracleError from cancelTx (lines 256-260)
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

vi.mock('../services/recovery-stuck-scanner.service.js', () => ({
  listStuckTxs: vi.fn().mockResolvedValue({ items: [], thresholdsUsed: {} }),
}));

vi.mock('../auth/rbac.middleware.js', () => ({
  requirePerm: vi.fn().mockReturnValue([]),
}));

vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/recovery-bump.service.js', () => ({
  bumpTx: vi.fn(),
  RecoveryDisabledError: class RecoveryDisabledError extends Error {
    statusCode = 503;
    code = 'RECOVERY_DISABLED';
    constructor(m: string) {
      super(m);
      this.name = 'RecoveryDisabledError';
    }
  },
  ColdTierNotSupportedError: class ColdTierNotSupportedError extends Error {
    statusCode = 403;
    code = 'COLD_TIER_NOT_SUPPORTED';
    constructor(m: string) {
      super(m);
      this.name = 'ColdTierNotSupportedError';
    }
  },
  RebalanceNotSupportedError: class RebalanceNotSupportedError extends Error {
    statusCode = 403;
    code = 'REBALANCE_NOT_SUPPORTED';
    constructor(m: string) {
      super(m);
      this.name = 'RebalanceNotSupportedError';
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
  AlreadyFinalError: class AlreadyFinalError extends Error {
    statusCode = 409;
    code = 'ALREADY_FINAL';
    constructor(m: string) {
      super(m);
      this.name = 'AlreadyFinalError';
    }
  },
  BumpRateLimitError: class BumpRateLimitError extends Error {
    statusCode = 429;
    code = 'BUMP_RATE_LIMIT';
    constructor(m: string) {
      super(m);
      this.name = 'BumpRateLimitError';
    }
  },
  GasOracleError: class GasOracleError extends Error {
    statusCode = 503;
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
    statusCode = 410;
    code = 'SOLANA_CANNOT_CANCEL';
    remedy = 'wait';
    constructor(m: string) {
      super(m);
      this.name = 'SolanaCannotCancelError';
    }
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000099';
const ENTITY_ID = '00000000-0000-0000-0000-000000000001';
const ACTION_ID = '00000000-0000-0000-0000-000000000002';

async function buildApp() {
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

  const { default: recoveryRoutes } = await import('../routes/recovery.routes.js');
  await app.register(recoveryRoutes);
  await app.ready();
  return app;
}

// ── POST /recovery/:entityType/:entityId/bump — makeNotify closure ─────────────

describe('POST /recovery/bump — makeNotify closure invoked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes makeNotify closure when bumpTx calls the notifyFn callback', async () => {
    const { bumpTx } = await import('../services/recovery-bump.service.js');
    const { notifyStaff } = await import('../services/notify-staff.service.js');

    // bumpTx calls the notifyFn synchronously before returning
    vi.mocked(bumpTx).mockImplementationOnce((async (
      _db: unknown,
      _params: unknown,
      notifyFn: (args: { title: string; body: string; actionId: string }) => Promise<void>
    ) => {
      await notifyFn({ title: 'Bump submitted', body: 'Tx bumped', actionId: ACTION_ID });
      return { ok: true, actionId: ACTION_ID, newTxHash: '0xnew', bumpCount: 1 };
    }) as unknown as typeof bumpTx);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/bump`,
      headers: { 'content-type': 'application/json' },
      payload: { idempotencyKey: 'idem-bump-001' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    // notifyStaff must have been called via the makeNotify closure
    expect(notifyStaff).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ eventType: 'recovery.bump', severity: 'critical' }),
      expect.anything(),
      expect.anything()
    );
  });
});

// ── POST /recovery/:entityType/:entityId/cancel — makeNotify + GasOracleError ─

describe('POST /recovery/cancel — makeNotify closure + GasOracleError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes makeNotify closure when cancelTx calls the notifyFn callback', async () => {
    const { cancelTx } = await import('../services/recovery-cancel.service.js');
    const { notifyStaff } = await import('../services/notify-staff.service.js');

    vi.mocked(cancelTx).mockImplementationOnce((async (
      _db: unknown,
      _params: unknown,
      notifyFn: (args: { title: string; body: string; actionId: string }) => Promise<void>
    ) => {
      await notifyFn({ title: 'Cancel submitted', body: 'Tx cancelled', actionId: ACTION_ID });
      return { ok: true, actionId: ACTION_ID, cancelTxHash: '0xcancel' };
    }) as unknown as typeof cancelTx);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/cancel`,
      headers: { 'content-type': 'application/json' },
      payload: { idempotencyKey: 'idem-cancel-001' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(notifyStaff).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ eventType: 'recovery.cancel', severity: 'critical' }),
      expect.anything(),
      expect.anything()
    );
  });

  it('returns 503 when cancelTx throws GasOracleError (lines 256-258)', async () => {
    const { cancelTx } = await import('../services/recovery-cancel.service.js');
    const { GasOracleError } = await import('../services/recovery-bump.service.js');

    vi.mocked(cancelTx).mockRejectedValueOnce(new GasOracleError('gas oracle down'));

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/recovery/withdrawal/${ENTITY_ID}/cancel`,
      headers: { 'content-type': 'application/json' },
      payload: { idempotencyKey: 'idem-cancel-002' },
    });
    await app.close();

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe('GAS_ORACLE_ERROR');
  });
});
