// E2E dev-mode integration test — full withdrawal lifecycle: create → approve ×2 → execute.
// All DB, queue, and Socket.io are mocked — no real Postgres, Redis, or network required.
// Mirrors the on-chain path that wallet-engine takes in dev-mode (synthetic tx hash).
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock kill-switch service so withdrawal E2E tests default to flag=off
// (the kill-switch.service tests cover the flag-on path independently)
vi.mock('../services/kill-switch.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/kill-switch.service.js')>();
  return {
    ...actual,
    getState: vi.fn().mockResolvedValue({
      enabled: false,
      reason: null,
      updatedByStaffId: null,
      updatedAt: new Date().toISOString(),
    }),
  };
});
import { PolicyRejectedError } from '../services/policy-client.js';
import {
  type ApproveWithdrawalInput,
  approveWithdrawal,
} from '../services/withdrawal-approve.service.js';
import { createWithdrawal } from '../services/withdrawal-create.service.js';
import {
  WITHDRAWAL_EXECUTE_QUEUE,
  executeWithdrawal,
} from '../services/withdrawal-execute.service.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const STAFF_1 = 'staff-uuid-0001';
const STAFF_2 = 'staff-uuid-0002';
const USER_ID = 'user-uuid-e2e';
const WD_ID = 'wd-uuid-e2e-001';
const OP_ID = 'op-uuid-e2e-001';
const KEY_1 = 'key-uuid-0001';
const KEY_2 = 'key-uuid-0002';

const VALID_CREATE_INPUT = {
  userId: USER_ID,
  chain: 'bnb' as const,
  token: 'USDT' as const,
  amount: '5000',
  destinationAddr: '0xDeAdBeEf00000000000000000000000000000001',
  sourceTier: 'hot' as const,
};

const makeUser = () => ({
  id: USER_ID,
  email: 'user@example.com',
  kycTier: 'basic',
  riskScore: 10,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeWithdrawalRow = (overrides: Record<string, unknown> = {}) => ({
  id: WD_ID,
  userId: USER_ID,
  chain: 'bnb',
  token: 'USDT',
  amount: '5000',
  destinationAddr: VALID_CREATE_INPUT.destinationAddr,
  status: 'pending',
  sourceTier: 'hot',
  multisigOpId: OP_ID,
  timeLockExpiresAt: null,
  createdBy: STAFF_1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeOpRow = (collectedSigs = 0, status = 'pending') => ({
  id: OP_ID,
  withdrawalId: WD_ID,
  chain: 'bnb',
  operationType: 'withdrawal',
  multisigAddr: '0x0000000000000000000000000000000000000001',
  requiredSigs: 2,
  collectedSigs,
  expiresAt: new Date(Date.now() + 86_400_000), // +24h
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ── Mock builders ─────────────────────────────────────────────────────────────

function makeInsertMock(rows: unknown[] = []) {
  const returning = vi.fn().mockResolvedValue(rows);
  const values = vi.fn().mockReturnValue({ returning });
  return vi.fn().mockReturnValue({ values });
}

function makeUpdateMock(rows: unknown[] = [{ id: WD_ID }]) {
  return vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

function makeSelectMock(balance = '999999') {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ balance }]),
    }),
  });
}

// ── Mock Socket.io emitter ────────────────────────────────────────────────────

function makeMockIo() {
  const emitFn = vi.fn();
  return {
    of: vi.fn().mockReturnValue({ emit: emitFn }),
    _emit: emitFn,
  };
}

// ── Mock BullMQ queue ─────────────────────────────────────────────────────────

function makeMockQueue() {
  const addFn = vi.fn().mockResolvedValue({ id: `${WITHDRAWAL_EXECUTE_QUEUE}:${WD_ID}` });
  return { add: addFn, _add: addFn };
}

// ── Policy client mock ────────────────────────────────────────────────────────

const mockCheckPolicy = vi.fn();

vi.mock('../services/policy-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/policy-client.js')>();
  return {
    ...actual,
    checkPolicy: (...args: unknown[]) => mockCheckPolicy(...args),
  };
});

const POLICY_OPTS = { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' };

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a DB mock for the CREATE phase:
 * - users.findFirst → user
 * - select (ledger balance) → 999999
 * - transaction inserts: withdrawal, multisig op, audit
 * - transaction update: withdrawal.multisigOpId
 */
function buildCreateDb() {
  const withdrawalRow = makeWithdrawalRow({ multisigOpId: null });
  const multisigOpRow = makeOpRow();

  let insertCount = 0;
  const txInsert = vi.fn().mockImplementation(() => {
    insertCount++;
    // 1 = withdrawal, 2 = multisig op, 3+ = audit
    const rows = insertCount === 1 ? [withdrawalRow] : insertCount === 2 ? [multisigOpRow] : [];
    const returning = vi.fn().mockResolvedValue(rows);
    return { values: vi.fn().mockReturnValue({ returning }) };
  });

  const txUpdate = makeUpdateMock([{ ...withdrawalRow, multisigOpId: OP_ID }]);

  return {
    query: {
      users: { findFirst: vi.fn().mockResolvedValue(makeUser()) },
    },
    select: makeSelectMock(),
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ insert: txInsert, update: txUpdate })
      ),
  };
}

/**
 * Build a DB mock for the APPROVE phase.
 * @param collectedBefore number of sigs already collected
 * @param signingKeyId which staff signing key to return
 * @param alreadySigned whether a duplicate approval exists
 */
function buildApproveDb(collectedBefore: number, signingKeyId: string, alreadySigned = false) {
  const opRow = makeOpRow(collectedBefore, collectedBefore === 0 ? 'pending' : 'collecting');
  const newCollected = collectedBefore + 1;
  const newStatus = newCollected >= 2 ? 'ready' : 'collecting';
  const updatedOpRow = makeOpRow(newCollected, newStatus);

  const txInsert = makeInsertMock([]); // approval insert
  const txUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([updatedOpRow]),
      }),
    }),
  });
  // Second update for withdrawal status when threshold met
  let updateCallCount = 0;
  const txUpdateMulti = vi.fn().mockImplementation(() => {
    updateCallCount++;
    return {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue(
              updateCallCount === 1 ? [updatedOpRow] : [makeWithdrawalRow({ status: 'approved' })]
            ),
        }),
      }),
    };
  });

  return {
    query: {
      withdrawals: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            makeWithdrawalRow({ status: newCollected >= 2 ? 'approved' : 'pending' })
          ),
      },
      multisigOperations: { findFirst: vi.fn().mockResolvedValue(opRow) },
      staffSigningKeys: {
        findFirst: vi.fn().mockResolvedValue({
          id: signingKeyId,
          staffId: collectedBefore === 0 ? STAFF_1 : STAFF_2,
          chain: 'bnb',
          address: `0xSigner${signingKeyId}`,
        }),
      },
      multisigApprovals: {
        findFirst: vi.fn().mockResolvedValue(alreadySigned ? { id: 'dup' } : undefined),
      },
    },
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ insert: txInsert, update: txUpdateMulti })
      ),
  };
}

/**
 * Build DB mock for the EXECUTE phase.
 * Withdrawal must be 'approved', no active time-lock.
 */
function buildExecuteDb() {
  return {
    query: {
      withdrawals: {
        findFirst: vi
          .fn()
          .mockResolvedValue(makeWithdrawalRow({ status: 'approved', timeLockExpiresAt: null })),
      },
    },
    update: makeUpdateMock([makeWithdrawalRow({ status: 'executing' })]),
    // emitAudit uses a direct insert
    insert: makeInsertMock([]),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Withdrawal E2E dev-mode happy path', () => {
  beforeEach(() => {
    mockCheckPolicy.mockResolvedValue({ allow: true, reasons: [] });
  });

  it('Phase 1 — createWithdrawal creates row + multisig op + emits socket event', async () => {
    const db = buildCreateDb();
    const io = makeMockIo();

    const result = await createWithdrawal(
      db as unknown as Parameters<typeof createWithdrawal>[0],
      VALID_CREATE_INPUT,
      STAFF_1,
      io as unknown as Parameters<typeof createWithdrawal>[3],
      POLICY_OPTS
    );

    expect(result.withdrawal).toBeDefined();
    expect(result.multisigOp).toBeDefined();
    expect(io._emit).toHaveBeenCalledWith(
      'withdrawal.created',
      expect.objectContaining({ userId: USER_ID })
    );
    expect(mockCheckPolicy).toHaveBeenCalledOnce();
  });

  it('Phase 2a — first approveWithdrawal increments collectedSigs to 1, status=collecting', async () => {
    const db = buildApproveDb(0, KEY_1);
    const io = makeMockIo();

    const approveInput: ApproveWithdrawalInput = {
      signature: `0x${'a'.repeat(64)}`,
      signerAddress: `0xSigner${KEY_1}`,
      signedAt: new Date().toISOString(),
      multisigOpId: OP_ID,
      chain: 'bnb',
    };

    const result = await approveWithdrawal(
      db as unknown as Parameters<typeof approveWithdrawal>[0],
      WD_ID,
      STAFF_1,
      approveInput,
      io as unknown as Parameters<typeof approveWithdrawal>[4],
      POLICY_OPTS
    );

    expect(result.op.collectedSigs).toBe(1);
    expect(result.thresholdMet).toBe(false);
    expect(result.progress).toBe('1/2');
    expect(io._emit).toHaveBeenCalledWith(
      'multisig.progress',
      expect.objectContaining({ opId: OP_ID })
    );
  });

  it('Phase 2b — second approveWithdrawal meets threshold, status=ready, withdrawal=approved', async () => {
    const db = buildApproveDb(1, KEY_2);
    const io = makeMockIo();

    const approveInput: ApproveWithdrawalInput = {
      signature: `0x${'b'.repeat(64)}`,
      signerAddress: `0xSigner${KEY_2}`,
      signedAt: new Date().toISOString(),
      multisigOpId: OP_ID,
      chain: 'bnb',
    };

    const result = await approveWithdrawal(
      db as unknown as Parameters<typeof approveWithdrawal>[0],
      WD_ID,
      STAFF_2,
      approveInput,
      io as unknown as Parameters<typeof approveWithdrawal>[4],
      POLICY_OPTS
    );

    expect(result.op.collectedSigs).toBe(2);
    expect(result.op.status).toBe('ready');
    expect(result.thresholdMet).toBe(true);
    expect(result.progress).toBe('2/2');
    expect(io._emit).toHaveBeenCalledWith(
      'withdrawal.approved',
      expect.objectContaining({ withdrawalId: WD_ID, thresholdMet: true })
    );
  });

  it('Phase 3 — executeWithdrawal enqueues BullMQ job + emits executing event', async () => {
    const db = buildExecuteDb();
    const io = makeMockIo();
    const queue = makeMockQueue();

    const { jobId } = await executeWithdrawal(
      db as unknown as Parameters<typeof executeWithdrawal>[0],
      WD_ID,
      STAFF_1,
      queue as unknown as Parameters<typeof executeWithdrawal>[3],
      io as unknown as Parameters<typeof executeWithdrawal>[4]
    );

    expect(jobId).toContain(WD_ID);
    expect(queue._add).toHaveBeenCalledWith(
      WITHDRAWAL_EXECUTE_QUEUE,
      expect.objectContaining({ withdrawalId: WD_ID }),
      expect.objectContaining({ jobId: `withdrawal_execute:${WD_ID}` })
    );
    expect(io._emit).toHaveBeenCalledWith(
      'withdrawal.executing',
      expect.objectContaining({ withdrawalId: WD_ID })
    );
  });

  it('rejects duplicate approval from the same signing key', async () => {
    const db = buildApproveDb(0, KEY_1, /* alreadySigned */ true);
    const io = makeMockIo();

    await expect(
      approveWithdrawal(
        db as unknown as Parameters<typeof approveWithdrawal>[0],
        WD_ID,
        STAFF_1,
        {
          signature: `0x${'c'.repeat(64)}`,
          signerAddress: `0xSigner${KEY_1}`,
          signedAt: new Date().toISOString(),
          multisigOpId: OP_ID,
          chain: 'bnb',
        },
        io as unknown as Parameters<typeof approveWithdrawal>[4],
        POLICY_OPTS
      )
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('blocks execute when withdrawal is not yet approved', async () => {
    const db = {
      query: {
        withdrawals: {
          findFirst: vi.fn().mockResolvedValue(makeWithdrawalRow({ status: 'pending' })),
        },
      },
    };
    const io = makeMockIo();
    const queue = makeMockQueue();

    await expect(
      executeWithdrawal(
        db as unknown as Parameters<typeof executeWithdrawal>[0],
        WD_ID,
        STAFF_1,
        queue as unknown as Parameters<typeof executeWithdrawal>[3],
        io as unknown as Parameters<typeof executeWithdrawal>[4]
      )
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('blocks execute when time-lock is still active', async () => {
    const futureLock = new Date(Date.now() + 3_600_000); // +1h
    const db = {
      query: {
        withdrawals: {
          findFirst: vi
            .fn()
            .mockResolvedValue(
              makeWithdrawalRow({ status: 'approved', timeLockExpiresAt: futureLock })
            ),
        },
      },
    };
    const io = makeMockIo();
    const queue = makeMockQueue();

    await expect(
      executeWithdrawal(
        db as unknown as Parameters<typeof executeWithdrawal>[0],
        WD_ID,
        STAFF_1,
        queue as unknown as Parameters<typeof executeWithdrawal>[3],
        io as unknown as Parameters<typeof executeWithdrawal>[4]
      )
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('blocks approval when policy engine rejects', async () => {
    mockCheckPolicy.mockResolvedValue({
      allow: false,
      reasons: [{ rule: 'authorized_signer', message: 'Signer not whitelisted' }],
    });

    const db = buildApproveDb(0, KEY_1);
    const io = makeMockIo();

    await expect(
      approveWithdrawal(
        db as unknown as Parameters<typeof approveWithdrawal>[0],
        WD_ID,
        STAFF_1,
        {
          signature: `0x${'d'.repeat(64)}`,
          signerAddress: `0xSigner${KEY_1}`,
          signedAt: new Date().toISOString(),
          multisigOpId: OP_ID,
          chain: 'bnb',
        },
        io as unknown as Parameters<typeof approveWithdrawal>[4],
        POLICY_OPTS
      )
    ).rejects.toMatchObject({ name: 'PolicyRejectedError', statusCode: 403 });
  });
});
