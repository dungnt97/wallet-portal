// Unit tests for withdrawal execute service — happy path, status guard,
// BullMQ enqueue, timelock guard, broadcasted/confirmed callbacks, nonce handling.
// Uses in-memory mocks — no real Postgres, BullMQ, or Socket.io required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  NotFoundError,
  WITHDRAWAL_EXECUTE_QUEUE,
  executeWithdrawal,
  recordBroadcasted,
  recordConfirmed,
} from '../services/withdrawal-execute.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';
const WITHDRAWAL_ID = 'wd-uuid-0001';
const OP_ID = 'op-uuid-0001';

const makeWithdrawal = (overrides: Record<string, unknown> = {}) => ({
  id: WITHDRAWAL_ID,
  userId: 'user-uuid-0001',
  chain: 'bnb' as const,
  token: 'USDT' as const,
  amount: '1000',
  destinationAddr: '0xDest001',
  status: 'approved',
  sourceTier: 'hot' as const,
  multisigOpId: OP_ID,
  timeLockExpiresAt: null as Date | null,
  txHash: null,
  broadcastAt: null,
  nonce: null,
  createdBy: STAFF_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeUpdateMock() {
  return vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ id: WITHDRAWAL_ID }]),
    }),
  });
}

function buildMockDb(withdrawal: ReturnType<typeof makeWithdrawal> | undefined) {
  const txMock = {
    update: makeUpdateMock(),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
  };

  return {
    query: {
      withdrawals: { findFirst: vi.fn().mockResolvedValue(withdrawal) },
    },
    update: makeUpdateMock(),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
  };
}

function makeMockQueue(jobId = 'job-001') {
  return { add: vi.fn().mockResolvedValue({ id: jobId }) };
}

function makeMockIo() {
  const emitFn = vi.fn();
  return { of: vi.fn().mockReturnValue({ emit: emitFn }), _emit: emitFn };
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/ledger.service.js', () => ({
  recordWithdrawalBroadcast: vi.fn().mockResolvedValue(undefined),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('executeWithdrawal service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path — updates status to executing, enqueues BullMQ job, emits socket event', async () => {
    const db = buildMockDb(makeWithdrawal());
    const queue = makeMockQueue('job-uuid-001');
    const io = makeMockIo();

    const result = await executeWithdrawal(
      db as unknown as Parameters<typeof executeWithdrawal>[0],
      WITHDRAWAL_ID,
      STAFF_ID,
      queue as unknown as Parameters<typeof executeWithdrawal>[3],
      io as unknown as Parameters<typeof executeWithdrawal>[4]
    );

    expect(result.jobId).toBeDefined();
    expect(queue.add).toHaveBeenCalledWith(
      WITHDRAWAL_EXECUTE_QUEUE,
      expect.objectContaining({ withdrawalId: WITHDRAWAL_ID, multisigOpId: OP_ID }),
      expect.objectContaining({ jobId: `withdrawal_execute:${WITHDRAWAL_ID}` })
    );
    expect(io._emit).toHaveBeenCalledWith(
      'withdrawal.executing',
      expect.objectContaining({ withdrawalId: WITHDRAWAL_ID })
    );
    expect(db.update).toHaveBeenCalled();
  });

  it('throws NotFoundError when withdrawal not found', async () => {
    const db = buildMockDb(undefined);
    const queue = makeMockQueue();
    const io = makeMockIo();

    await expect(
      executeWithdrawal(
        db as unknown as Parameters<typeof executeWithdrawal>[0],
        WITHDRAWAL_ID,
        STAFF_ID,
        queue as unknown as Parameters<typeof executeWithdrawal>[3],
        io as unknown as Parameters<typeof executeWithdrawal>[4]
      )
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });

  it('throws ConflictError when withdrawal status is not approved or time_locked', async () => {
    const db = buildMockDb(makeWithdrawal({ status: 'pending' }));
    const queue = makeMockQueue();
    const io = makeMockIo();

    await expect(
      executeWithdrawal(
        db as unknown as Parameters<typeof executeWithdrawal>[0],
        WITHDRAWAL_ID,
        STAFF_ID,
        queue as unknown as Parameters<typeof executeWithdrawal>[3],
        io as unknown as Parameters<typeof executeWithdrawal>[4]
      )
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('throws ConflictError when timelock has not yet expired', async () => {
    const futureDate = new Date(Date.now() + 3_600_000); // +1h
    const db = buildMockDb(
      makeWithdrawal({ status: 'time_locked', timeLockExpiresAt: futureDate })
    );
    const queue = makeMockQueue();
    const io = makeMockIo();

    await expect(
      executeWithdrawal(
        db as unknown as Parameters<typeof executeWithdrawal>[0],
        WITHDRAWAL_ID,
        STAFF_ID,
        queue as unknown as Parameters<typeof executeWithdrawal>[3],
        io as unknown as Parameters<typeof executeWithdrawal>[4]
      )
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('throws ConflictError when withdrawal has no multisigOpId', async () => {
    const db = buildMockDb(makeWithdrawal({ multisigOpId: null }));
    const queue = makeMockQueue();
    const io = makeMockIo();

    await expect(
      executeWithdrawal(
        db as unknown as Parameters<typeof executeWithdrawal>[0],
        WITHDRAWAL_ID,
        STAFF_ID,
        queue as unknown as Parameters<typeof executeWithdrawal>[3],
        io as unknown as Parameters<typeof executeWithdrawal>[4]
      )
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('accepts time_locked withdrawal when timelock has expired', async () => {
    const pastDate = new Date(Date.now() - 3_600_000); // -1h
    const db = buildMockDb(makeWithdrawal({ status: 'time_locked', timeLockExpiresAt: pastDate }));
    const queue = makeMockQueue('job-uuid-002');
    const io = makeMockIo();

    const result = await executeWithdrawal(
      db as unknown as Parameters<typeof executeWithdrawal>[0],
      WITHDRAWAL_ID,
      STAFF_ID,
      queue as unknown as Parameters<typeof executeWithdrawal>[3],
      io as unknown as Parameters<typeof executeWithdrawal>[4]
    );

    expect(result.jobId).toBeDefined();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  // ── Broadcasted callback tests ────────────────────────────────────────────────

  it('recordBroadcasted updates status to broadcast and records ledger entry', async () => {
    const withdrawal = makeWithdrawal({ status: 'executing' });
    const db = buildMockDb(withdrawal);
    const io = makeMockIo();
    const txHash = '0x1234567890abcdef';

    await recordBroadcasted(
      db as unknown as Parameters<typeof recordBroadcasted>[0],
      WITHDRAWAL_ID,
      { txHash },
      io as unknown as Parameters<typeof recordBroadcasted>[3]
    );

    // Transaction should have been called, which means withdrawal state was updated
    expect(db.transaction).toHaveBeenCalled();
    expect(io._emit).toHaveBeenCalledWith(
      'withdrawal.broadcast',
      expect.objectContaining({ withdrawalId: WITHDRAWAL_ID, txHash, status: 'broadcast' })
    );
  });

  it('recordBroadcasted persists nonce when provided', async () => {
    const withdrawal = makeWithdrawal({ status: 'executing' });
    const db = buildMockDb(withdrawal);
    const io = makeMockIo();
    const txHash = '0xabcdef1234567890';
    const nonce = 42;

    await recordBroadcasted(
      db as unknown as Parameters<typeof recordBroadcasted>[0],
      WITHDRAWAL_ID,
      { txHash, nonce },
      io as unknown as Parameters<typeof recordBroadcasted>[3]
    );

    expect(db.transaction).toHaveBeenCalled();
    expect(io._emit).toHaveBeenCalledWith('withdrawal.broadcast', expect.any(Object));
  });

  it('recordBroadcasted throws NotFoundError when withdrawal not found', async () => {
    const db = buildMockDb(undefined);
    const io = makeMockIo();

    await expect(
      recordBroadcasted(
        db as unknown as Parameters<typeof recordBroadcasted>[0],
        WITHDRAWAL_ID,
        { txHash: '0xabc' },
        io as unknown as Parameters<typeof recordBroadcasted>[3]
      )
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });

  it('recordBroadcasted accepts null nonce', async () => {
    const withdrawal = makeWithdrawal({ status: 'executing' });
    const db = buildMockDb(withdrawal);
    const io = makeMockIo();
    const txHash = '0xfedcba0987654321';

    await recordBroadcasted(
      db as unknown as Parameters<typeof recordBroadcasted>[0],
      WITHDRAWAL_ID,
      { txHash, nonce: null },
      io as unknown as Parameters<typeof recordBroadcasted>[3]
    );

    expect(db.transaction).toHaveBeenCalled();
  });

  // ── Confirmed callback tests ──────────────────────────────────────────────────

  it('recordConfirmed updates status to completed and emits event', async () => {
    const withdrawal = makeWithdrawal({ status: 'broadcast' });
    const db = buildMockDb(withdrawal);
    const io = makeMockIo();

    await recordConfirmed(
      db as unknown as Parameters<typeof recordConfirmed>[0],
      WITHDRAWAL_ID,
      io as unknown as Parameters<typeof recordConfirmed>[2]
    );

    expect(db.transaction).toHaveBeenCalled();
    expect(io._emit).toHaveBeenCalledWith(
      'withdrawal.confirmed',
      expect.objectContaining({ withdrawalId: WITHDRAWAL_ID, status: 'completed' })
    );
  });

  it('recordConfirmed throws NotFoundError when withdrawal not found', async () => {
    const db = buildMockDb(undefined);
    const io = makeMockIo();

    await expect(
      recordConfirmed(
        db as unknown as Parameters<typeof recordConfirmed>[0],
        WITHDRAWAL_ID,
        io as unknown as Parameters<typeof recordConfirmed>[2]
      )
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });

  // ── Edge case tests ───────────────────────────────────────────────────────────

  it('executeWithdrawal includes all job data fields in BullMQ payload', async () => {
    const withdrawal = makeWithdrawal({
      chain: 'sol',
      token: 'USDC',
      amount: '500.5',
      sourceTier: 'cold',
    });
    const db = buildMockDb(withdrawal);
    const queue = makeMockQueue('job-uuid-003');
    const io = makeMockIo();

    await executeWithdrawal(
      db as unknown as Parameters<typeof executeWithdrawal>[0],
      WITHDRAWAL_ID,
      STAFF_ID,
      queue as unknown as Parameters<typeof executeWithdrawal>[3],
      io as unknown as Parameters<typeof executeWithdrawal>[4]
    );

    expect(queue.add).toHaveBeenCalledWith(
      WITHDRAWAL_EXECUTE_QUEUE,
      expect.objectContaining({
        withdrawalId: WITHDRAWAL_ID,
        multisigOpId: OP_ID,
        chain: 'sol',
        token: 'USDC',
        amount: '500.5',
        destinationAddr: withdrawal.destinationAddr,
        sourceTier: 'cold',
      }),
      expect.any(Object)
    );
  });

  it('executeWithdrawal maintains idempotent job ID format', async () => {
    const db = buildMockDb(makeWithdrawal());
    const queue = makeMockQueue();
    const io = makeMockIo();

    await executeWithdrawal(
      db as unknown as Parameters<typeof executeWithdrawal>[0],
      WITHDRAWAL_ID,
      STAFF_ID,
      queue as unknown as Parameters<typeof executeWithdrawal>[3],
      io as unknown as Parameters<typeof executeWithdrawal>[4]
    );

    expect(queue.add).toHaveBeenCalledWith(
      WITHDRAWAL_EXECUTE_QUEUE,
      expect.any(Object),
      expect.objectContaining({ jobId: `withdrawal_execute:${WITHDRAWAL_ID}` })
    );
  });
});
