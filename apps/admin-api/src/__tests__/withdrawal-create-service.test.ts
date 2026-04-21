// Unit tests for withdrawal create service — golden path, KYC rejection,
// insufficient balance, policy block.
// Uses in-memory mocks — no real Postgres or Policy Engine required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

// ── Mock Policy client (allow by default) ─────────────────────────────────────

const mockCheckPolicy = vi.fn();

vi.mock('../services/policy-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/policy-client.js')>();
  return {
    ...actual,
    checkPolicy: (...args: unknown[]) => mockCheckPolicy(...args),
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createWithdrawal service', () => {
  beforeEach(() => {
    mockCheckPolicy.mockResolvedValue({ allow: true, reasons: [] });
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
});
