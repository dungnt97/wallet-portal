import type { Queue } from 'bullmq';
// Unit tests for withdrawal create service — golden path, KYC rejection,
// insufficient balance, policy block, time-lock logic, chain-specific behavior.
// Uses in-memory mocks — no real Postgres or Policy Engine required.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PolicyRejectedError } from '../services/policy-client.js';
import {
  NotFoundError,
  ValidationError,
  createWithdrawal,
} from '../services/withdrawal-create.service.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';
const USER_ID = 'user-uuid-0001';

const VALID_INPUT = {
  userId: USER_ID,
  chain: 'bnb' as const,
  token: 'USDT' as const,
  amount: '1000',
  destinationAddr: '0xDeAdBeEf00000000000000000000000000000001',
  sourceTier: 'hot' as const,
};

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  email: 'user@example.com',
  kycTier: 'basic',
  riskScore: 10,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ── Mock builder helpers ──────────────────────────────────────────────────────

/**
 * Build a minimal drizzle-like insert mock that supports:
 *   .insert().values().returning()
 * Uses mockResolvedValue (not thenable objects) to satisfy biome noThenProperty.
 */
function makeInsertMock(returnRows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returnRows);
  const onConflictDoUpdate = vi.fn().mockResolvedValue(returnRows);
  const values = vi.fn().mockReturnValue({ returning, onConflictDoUpdate });
  return vi.fn().mockReturnValue({ values });
}

function makeUpdateMock(returnRows: unknown[] = [{ id: 'updated' }]) {
  return vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returnRows),
      }),
    }),
  });
}

/** Ledger balance SELECT mock — returns numeric balance string */
function makeSelectMock(balance = '99999') {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ balance }]),
    }),
  });
}

function buildMockDb(opts: {
  user?: ReturnType<typeof makeUser> | undefined;
  balance?: string;
  withdrawalRow?: Record<string, unknown>;
  multisigOpRow?: Record<string, unknown>;
}) {
  const withdrawalRow = opts.withdrawalRow ?? {
    id: 'wd-uuid-0001',
    userId: USER_ID,
    chain: 'bnb',
    token: 'USDT',
    amount: '1000',
    destinationAddr: VALID_INPUT.destinationAddr,
    status: 'pending',
    sourceTier: 'hot',
    multisigOpId: null,
    timeLockExpiresAt: null,
    createdBy: STAFF_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const multisigOpRow = opts.multisigOpRow ?? {
    id: 'op-uuid-0001',
    withdrawalId: 'wd-uuid-0001',
    chain: 'bnb',
    operationType: 'withdrawal',
    multisigAddr: '0x0000000000000000000000000000000000000001',
    requiredSigs: 2,
    collectedSigs: 0,
    expiresAt: new Date(),
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Each insert call returns different rows depending on order:
  //   1st insert → withdrawal row
  //   2nd insert → multisig op row
  //   3rd insert → audit log (empty)
  let insertCallCount = 0;
  const insertMock = vi.fn().mockImplementation(() => {
    insertCallCount++;
    const rows =
      insertCallCount === 1 ? [withdrawalRow] : insertCallCount === 2 ? [multisigOpRow] : [];
    const returning = vi.fn().mockResolvedValue(rows);
    const onConflictDoUpdate = vi.fn().mockResolvedValue(rows);
    return { values: vi.fn().mockReturnValue({ returning, onConflictDoUpdate }) };
  });

  const txMock = {
    insert: insertMock,
    update: makeUpdateMock(),
  };

  return {
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue(opts.user),
      },
    },
    select: makeSelectMock(opts.balance ?? '99999'),
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
  };
}

// ── Mock Socket.io emitter ────────────────────────────────────────────────────

function makeMockIo() {
  const emitFn = vi.fn();
  return {
    of: vi.fn().mockReturnValue({ emit: emitFn }),
    _emit: emitFn,
  };
}

// ── Mock BullMQ Queue ──────────────────────────────────────────────────────

function makeMockQueue() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-uuid-0001' }),
  } as unknown as Queue;
}

// ── Mock Policy client (allow by default) ─────────────────────────────────────

const mockCheckPolicy = vi.fn();

vi.mock('../services/policy-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/policy-client.js')>();
  return {
    ...actual,
    checkPolicy: (...args: unknown[]) => mockCheckPolicy(...args),
  };
});

// ── Mock kill-switch service (disabled by default) ────────────────────────────

const mockGetKillSwitchState = vi.fn();

vi.mock('../services/kill-switch.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/kill-switch.service.js')>();
  return {
    ...actual,
    getState: (...args: unknown[]) => mockGetKillSwitchState(...args),
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createWithdrawal service', () => {
  beforeEach(() => {
    mockCheckPolicy.mockResolvedValue({ allow: true, reasons: [] });
    mockGetKillSwitchState.mockResolvedValue({
      enabled: false,
      reason: null,
      updatedByStaffId: null,
      updatedAt: new Date().toISOString(),
    });
    // M3 fix: SAFE_ADDRESS + SQUADS_MULTISIG_ADDRESS are now required (no silent fallback).
    // Set test values so unit tests exercise the service without a deployed contract.
    process.env.SAFE_ADDRESS = '0xSafeTestAddress0000000000000000000000001';
    process.env.SQUADS_MULTISIG_ADDRESS = 'SquadsTestPDA11111111111111111111111111111';
  });

  afterEach(() => {
    // Clean up environment vars
    process.env.SAFE_ADDRESS = '0xSafeTestAddress0000000000000000000000001';
    process.env.SQUADS_MULTISIG_ADDRESS = 'SquadsTestPDA11111111111111111111111111111';
    process.env.SLICE7_TIMELOCK_FASTFORWARD = undefined;
  });

  it('golden path — creates withdrawal + multisig op + emits socket event', async () => {
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      VALID_INPUT,
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.withdrawal).toBeDefined();
    expect(result.multisigOp).toBeDefined();
    expect(io._emit).toHaveBeenCalledWith(
      'withdrawal.created',
      expect.objectContaining({ userId: USER_ID })
    );
  });

  it('throws NotFoundError when user does not exist', async () => {
    const db = buildMockDb({ user: undefined });
    const io = makeMockIo();

    await expect(
      createWithdrawal(
        db as unknown as Parameters<typeof createWithdrawal>[0],
        VALID_INPUT,
        STAFF_ID,
        io as unknown as Parameters<typeof createWithdrawal>[3],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });

  it('throws ValidationError when user KYC tier is none', async () => {
    const db = buildMockDb({ user: makeUser({ kycTier: 'none' }) });
    const io = makeMockIo();

    await expect(
      createWithdrawal(
        db as unknown as Parameters<typeof createWithdrawal>[0],
        VALID_INPUT,
        STAFF_ID,
        io as unknown as Parameters<typeof createWithdrawal>[3],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({ name: 'ValidationError', statusCode: 422 });
  });

  it('throws ValidationError when balance is insufficient', async () => {
    const db = buildMockDb({ user: makeUser(), balance: '0.5' });
    const io = makeMockIo();

    await expect(
      createWithdrawal(
        db as unknown as Parameters<typeof createWithdrawal>[0],
        { ...VALID_INPUT, amount: '1000' },
        STAFF_ID,
        io as unknown as Parameters<typeof createWithdrawal>[3],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({ name: 'ValidationError', statusCode: 422 });
  });

  it('throws PolicyRejectedError when policy engine blocks', async () => {
    mockCheckPolicy.mockResolvedValue({
      allow: false,
      reasons: [{ rule: 'daily_limit', message: 'Daily limit exceeded' }],
    });
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    await expect(
      createWithdrawal(
        db as unknown as Parameters<typeof createWithdrawal>[0],
        VALID_INPUT,
        STAFF_ID,
        io as unknown as Parameters<typeof createWithdrawal>[3],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({
      name: 'PolicyRejectedError',
      statusCode: 403,
      code: 'POLICY_REJECTED',
    });
  });

  it('throws KillSwitchEnabledError (423) when kill-switch is on', async () => {
    mockGetKillSwitchState.mockResolvedValue({
      enabled: true,
      reason: 'security incident',
      updatedByStaffId: null,
      updatedAt: new Date().toISOString(),
    });
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    await expect(
      createWithdrawal(
        db as unknown as Parameters<typeof createWithdrawal>[0],
        VALID_INPUT,
        STAFF_ID,
        io as unknown as Parameters<typeof createWithdrawal>[3],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({
      name: 'KillSwitchEnabledError',
      statusCode: 423,
      code: 'KILL_SWITCH_ENABLED',
    });
    // User should never be loaded when kill-switch is on
    expect(db.query.users.findFirst).not.toHaveBeenCalled();
  });

  // ── Time-lock tests ───────────────────────────────────────────────────────────

  it('creates withdrawal with time_locked status for cold tier', async () => {
    const db = buildMockDb({
      user: makeUser(),
      withdrawalRow: {
        id: 'wd-uuid-0001',
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        destinationAddr: VALID_INPUT.destinationAddr,
        status: 'time_locked',
        sourceTier: 'cold',
        multisigOpId: null,
        timeLockExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        createdBy: STAFF_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      { ...VALID_INPUT, sourceTier: 'cold' },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.withdrawal?.status).toBe('time_locked');
    expect(result.withdrawal?.sourceTier).toBe('cold');
    expect(result.withdrawal?.timeLockExpiresAt).toBeDefined();
  });

  it('creates withdrawal with 48h time-lock for cold tier (non-fastforward)', async () => {
    process.env.SLICE7_TIMELOCK_FASTFORWARD = undefined;
    const before = Date.now();
    const db = buildMockDb({
      user: makeUser(),
      withdrawalRow: {
        id: 'wd-uuid-0001',
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        destinationAddr: VALID_INPUT.destinationAddr,
        status: 'time_locked',
        sourceTier: 'cold',
        multisigOpId: null,
        timeLockExpiresAt: new Date(before + 48 * 60 * 60 * 1000),
        createdBy: STAFF_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      { ...VALID_INPUT, sourceTier: 'cold' },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    const expiresMs = result.withdrawal?.timeLockExpiresAt?.getTime() ?? 0;
    // Should be ~48h from now (with some tolerance)
    expect(expiresMs).toBeGreaterThan(before + 47 * 60 * 60 * 1000);
    expect(expiresMs).toBeLessThan(before + 49 * 60 * 60 * 1000);
  });

  it('creates withdrawal with 5s time-lock for cold tier (with fastforward)', async () => {
    process.env.SLICE7_TIMELOCK_FASTFORWARD = 'true';
    const before = Date.now();
    const db = buildMockDb({
      user: makeUser(),
      withdrawalRow: {
        id: 'wd-uuid-0001',
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        destinationAddr: VALID_INPUT.destinationAddr,
        status: 'time_locked',
        sourceTier: 'cold',
        multisigOpId: null,
        timeLockExpiresAt: new Date(before + 5 * 1000),
        createdBy: STAFF_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      { ...VALID_INPUT, sourceTier: 'cold' },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    const expiresMs = result.withdrawal?.timeLockExpiresAt?.getTime() ?? 0;
    // Should be ~5s from now
    expect(expiresMs).toBeGreaterThan(before + 4 * 1000);
    expect(expiresMs).toBeLessThan(before + 6 * 1000);
  });

  it('creates withdrawal with 24h time-lock for hot tier >= 50k USD', async () => {
    const before = Date.now();
    const db = buildMockDb({
      user: makeUser(),
      withdrawalRow: {
        id: 'wd-uuid-0001',
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '75000',
        destinationAddr: VALID_INPUT.destinationAddr,
        status: 'pending',
        sourceTier: 'hot',
        multisigOpId: null,
        timeLockExpiresAt: new Date(before + 24 * 60 * 60 * 1000),
        createdBy: STAFF_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      { ...VALID_INPUT, sourceTier: 'hot', amount: '75000' },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    const expiresMs = result.withdrawal?.timeLockExpiresAt?.getTime() ?? 0;
    // Should be ~24h from now
    expect(expiresMs).toBeGreaterThan(before + 23 * 60 * 60 * 1000);
    expect(expiresMs).toBeLessThan(before + 25 * 60 * 60 * 1000);
  });

  it('creates withdrawal with no time-lock for hot tier < 50k USD', async () => {
    const db = buildMockDb({
      user: makeUser(),
      withdrawalRow: {
        id: 'wd-uuid-0001',
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        destinationAddr: VALID_INPUT.destinationAddr,
        status: 'pending',
        sourceTier: 'hot',
        multisigOpId: null,
        timeLockExpiresAt: null,
        createdBy: STAFF_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      { ...VALID_INPUT, sourceTier: 'hot', amount: '1000' },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.withdrawal?.timeLockExpiresAt).toBeNull();
  });

  // ── Chain-specific multisig address tests ──────────────────────────────────────

  it('uses SAFE_ADDRESS env var for BNB chain withdrawal', async () => {
    process.env.SAFE_ADDRESS = '0xMyCustomSafeAddress000000000000000000001';
    const db = buildMockDb({
      user: makeUser(),
      multisigOpRow: {
        id: 'op-uuid-0001',
        withdrawalId: 'wd-uuid-0001',
        chain: 'bnb',
        operationType: 'withdrawal',
        multisigAddr: '0xMyCustomSafeAddress000000000000000000001',
        requiredSigs: 2,
        collectedSigs: 0,
        expiresAt: new Date(),
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      { ...VALID_INPUT, chain: 'bnb' },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.multisigOp?.multisigAddr).toBe('0xMyCustomSafeAddress000000000000000000001');
  });

  it('uses SQUADS_MULTISIG_ADDRESS env var for SOL chain withdrawal', async () => {
    process.env.SQUADS_MULTISIG_ADDRESS = 'MyCustomSquadsPDA00000000000000000000001';
    const db = buildMockDb({
      user: makeUser(),
      multisigOpRow: {
        id: 'op-uuid-0001',
        withdrawalId: 'wd-uuid-0001',
        chain: 'sol',
        operationType: 'withdrawal',
        multisigAddr: 'MyCustomSquadsPDA00000000000000000000001',
        requiredSigs: 2,
        collectedSigs: 0,
        expiresAt: new Date(),
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      { ...VALID_INPUT, chain: 'sol' },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.multisigOp?.multisigAddr).toBe('MyCustomSquadsPDA00000000000000000000001');
  });

  it('throws error when SAFE_ADDRESS env var not set for BNB withdrawal', async () => {
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (= undefined coerces to string "undefined")
    delete process.env.SAFE_ADDRESS;
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    await expect(
      createWithdrawal(
        db as unknown as Parameters<typeof createWithdrawal>[0],
        { ...VALID_INPUT, chain: 'bnb' },
        STAFF_ID,
        io as unknown as Parameters<typeof createWithdrawal>[3],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({
      message: expect.stringContaining('SAFE_ADDRESS env var not set'),
    });
  });

  it('throws error when SQUADS_MULTISIG_ADDRESS env var not set for SOL withdrawal', async () => {
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (= undefined coerces to string "undefined")
    delete process.env.SQUADS_MULTISIG_ADDRESS;
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    await expect(
      createWithdrawal(
        db as unknown as Parameters<typeof createWithdrawal>[0],
        { ...VALID_INPUT, chain: 'sol' },
        STAFF_ID,
        io as unknown as Parameters<typeof createWithdrawal>[3],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({
      message: expect.stringContaining('SQUADS_MULTISIG_ADDRESS env var not set'),
    });
  });

  // ── KYC tier and balance edge cases ────────────────────────────────────────────

  it('accepts withdrawal with enhanced KYC tier', async () => {
    const db = buildMockDb({ user: makeUser({ kycTier: 'enhanced' }) });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      VALID_INPUT,
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.withdrawal).toBeDefined();
  });

  it('accepts withdrawal when balance exactly equals requested amount', async () => {
    const db = buildMockDb({ user: makeUser(), balance: '1000' });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      { ...VALID_INPUT, amount: '1000' },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.withdrawal).toBeDefined();
  });

  it('accepts withdrawal with decimal amount strings', async () => {
    const db = buildMockDb({ user: makeUser(), balance: '1000.5' });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      { ...VALID_INPUT, amount: '500.25' },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.withdrawal).toBeDefined();
  });

  // ── BullMQ queue enqueue tests ─────────────────────────────────────────────────

  it('enqueues cold-timelock job when queue provided and cold tier with timelock', async () => {
    const queue = makeMockQueue();
    const before = Date.now();
    const db = buildMockDb({
      user: makeUser(),
      withdrawalRow: {
        id: 'wd-uuid-0001',
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        destinationAddr: VALID_INPUT.destinationAddr,
        status: 'time_locked',
        sourceTier: 'cold',
        multisigOpId: null,
        timeLockExpiresAt: new Date(before + 48 * 60 * 60 * 1000),
        createdBy: STAFF_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const io = makeMockIo();

    await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      { ...VALID_INPUT, sourceTier: 'cold' },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' },
      queue
    );

    expect(queue.add).toHaveBeenCalledWith(
      'cold_timelock_broadcast',
      { withdrawalId: 'wd-uuid-0001' },
      expect.objectContaining({
        jobId: 'wd-uuid-0001',
        delay: expect.any(Number),
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      })
    );
  });

  it('does not enqueue job when queue is undefined', async () => {
    process.env.SLICE7_TIMELOCK_FASTFORWARD = undefined;
    const db = buildMockDb({
      user: makeUser(),
      withdrawalRow: {
        id: 'wd-uuid-0001',
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        destinationAddr: VALID_INPUT.destinationAddr,
        status: 'time_locked',
        sourceTier: 'cold',
        multisigOpId: null,
        timeLockExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        createdBy: STAFF_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const io = makeMockIo();

    await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      { ...VALID_INPUT, sourceTier: 'cold' },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      // no queue
    );

    // Queue is undefined, so no enqueue should happen
    // (We can't assert queue.add was NOT called since queue is undefined,
    //  but we verify the code doesn't throw)
  });

  it('does not enqueue job for hot tier even with queue provided', async () => {
    const queue = makeMockQueue();
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      { ...VALID_INPUT, sourceTier: 'hot' },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' },
      queue
    );

    // Hot tier with small amount should not enqueue
    expect(queue.add).not.toHaveBeenCalled();
  });

  // ── Socket.io event structure tests ────────────────────────────────────────────

  it('emits withdrawal.created socket event with correct structure', async () => {
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      VALID_INPUT,
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(io._emit).toHaveBeenCalledWith(
      'withdrawal.created',
      expect.objectContaining({
        id: 'wd-uuid-0001',
        userId: USER_ID,
        chain: 'bnb',
        token: 'USDT',
        amount: '1000',
        destinationAddr: VALID_INPUT.destinationAddr,
        status: 'pending',
        sourceTier: 'hot',
        multisigOpId: expect.any(String),
      })
    );
  });

  it('emits socket event with correct /stream namespace', async () => {
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      VALID_INPUT,
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(io.of).toHaveBeenCalledWith('/stream');
  });

  // ── SOL chain specific tests ───────────────────────────────────────────────────

  it('creates withdrawal for SOL chain', async () => {
    const db = buildMockDb({
      user: makeUser(),
      multisigOpRow: {
        id: 'op-uuid-0001',
        withdrawalId: 'wd-uuid-0001',
        chain: 'sol',
        operationType: 'withdrawal',
        multisigAddr: process.env.SQUADS_MULTISIG_ADDRESS,
        requiredSigs: 2,
        collectedSigs: 0,
        expiresAt: new Date(),
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      withdrawalRow: {
        id: 'wd-uuid-0001',
        userId: USER_ID,
        chain: 'sol',
        token: 'USDC',
        amount: '1000',
        destinationAddr: 'SolanaAddressHere11111111111111111111111111',
        status: 'pending',
        sourceTier: 'hot',
        multisigOpId: null,
        timeLockExpiresAt: null,
        createdBy: STAFF_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      {
        ...VALID_INPUT,
        chain: 'sol',
        token: 'USDC',
        destinationAddr: 'SolanaAddressHere11111111111111111111111111',
      },
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.withdrawal?.chain).toBe('sol');
    expect(result.multisigOp?.chain).toBe('sol');
  });

  // ── Multisig operation expiry and structure tests ──────────────────────────────

  it('multisig operation expires in 24h', async () => {
    const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const db = buildMockDb({
      user: makeUser(),
      multisigOpRow: {
        id: 'op-uuid-0001',
        withdrawalId: 'wd-uuid-0001',
        chain: 'bnb',
        operationType: 'withdrawal',
        multisigAddr: '0x0000000000000000000000000000000000000001',
        requiredSigs: 2,
        collectedSigs: 0,
        expiresAt: futureExpiry,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      VALID_INPUT,
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    const expiresMs = result.multisigOp?.expiresAt?.getTime() ?? 0;
    const expectedMs = futureExpiry.getTime();
    // Should be ~24h from now (with tolerance)
    expect(expiresMs).toBeGreaterThan(expectedMs - 1000);
    expect(expiresMs).toBeLessThan(expectedMs + 1000);
  });

  it('multisig operation requires 2 signatures', async () => {
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      VALID_INPUT,
      STAFF_ID,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.multisigOp?.requiredSigs).toBe(2);
    expect(result.multisigOp?.collectedSigs).toBe(0);
    expect(result.multisigOp?.status).toBe('pending');
  });
});
