// Unit tests for withdrawal execute service — happy path, status guard,
// BullMQ enqueue, timelock guard, not-found.
// Uses in-memory mocks — no real Postgres, BullMQ, or Socket.io required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  NotFoundError,
  WITHDRAWAL_EXECUTE_QUEUE,
  executeWithdrawal,
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
  return {
    query: {
      withdrawals: { findFirst: vi.fn().mockResolvedValue(withdrawal) },
    },
    update: makeUpdateMock(),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
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
});
