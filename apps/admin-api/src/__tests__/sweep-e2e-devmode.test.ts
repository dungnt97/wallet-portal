// E2E dev-mode integration test — full sweep lifecycle: candidates → trigger → enqueue.
// All DB, queue, and Socket.io are mocked — no real Postgres, Redis, or network required.
// Mirrors withdrawal-e2e-devmode.test.ts pattern.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock kill-switch service so sweep E2E tests default to flag=off
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
import { scanSweepCandidates } from '../services/sweep-candidate-scan.service.js';
import {
  SWEEP_EXECUTE_QUEUE,
  type SweepExecuteJobData,
  createSweeps,
  recordSweepBroadcasted,
  recordSweepConfirmed,
} from '../services/sweep-create.service.js';

// ── Shared fixtures ────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-sweep-001';
const UA_ID = 'ua-uuid-sweep-001';
const SWEEP_ID = 'sweep-uuid-001';
const STAFF_ID = 'staff-uuid-sweep-001';
const TX_HASH = '0xdeadbeef000000000000000000000000000000000000000000000000000000ab';

const makeUserAddress = (overrides = {}) => ({
  id: UA_ID,
  userId: USER_ID,
  chain: 'bnb' as const,
  address: '0xUserHdAddress0001',
  derivationPath: "m/44'/60'/0'/0/5",
  tier: 'hot' as const,
  createdAt: new Date(),
  ...overrides,
});

const makeSweepRow = (overrides = {}) => ({
  id: SWEEP_ID,
  userAddressId: UA_ID,
  chain: 'bnb' as const,
  token: 'USDT' as const,
  fromAddr: '0xUserHdAddress0001',
  toMultisig: '0xHotSafe0001',
  amount: '1000',
  status: 'pending' as const,
  txHash: null,
  createdBy: STAFF_ID,
  broadcastAt: null,
  confirmedAt: null,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ── Mock builders ─────────────────────────────────────────────────────────────

function makeInsertMock(rows: unknown[] = []) {
  const returning = vi.fn().mockResolvedValue(rows);
  const values = vi.fn().mockReturnValue({ returning });
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  return vi
    .fn()
    .mockReturnValue({ values: vi.fn().mockReturnValue({ returning, onConflictDoUpdate }) });
}

function makeUpdateMock(rows: unknown[] = []) {
  return vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

function makeSelectMock(results: unknown[] = []) {
  const where = vi.fn().mockResolvedValue(results);
  const from = vi.fn().mockReturnValue({ where });
  return vi.fn().mockReturnValue({ from });
}

function makeMockIo() {
  const emitFn = vi.fn();
  return {
    of: vi.fn().mockReturnValue({ emit: emitFn }),
    _emit: emitFn,
  };
}

function makeMockQueue() {
  const addFn = vi.fn().mockResolvedValue({ id: `sweep_execute_${SWEEP_ID}` });
  return { add: addFn, _add: addFn };
}

// ── DB mocks ──────────────────────────────────────────────────────────────────

/** DB mock for scanSweepCandidates */
function buildCandidateDb() {
  return {
    select: vi
      .fn()
      // First call: credited deposits
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi
              .fn()
              .mockResolvedValue([
                { userId: USER_ID, chain: 'bnb', token: 'USDT', totalAmount: '1500' },
              ]),
          }),
        }),
      })
      // Second call: active sweeps
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no active sweeps
        }),
      })
      // Third call: user_addresses
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([makeUserAddress()]),
        }),
      }),
  };
}

/** DB mock for createSweeps */
function buildCreateDb() {
  const sweepRow = makeSweepRow();
  let selectCall = 0;

  return {
    select: vi.fn().mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        // Load user_addresses
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([makeUserAddress()]),
          }),
        };
      }
      if (selectCall === 2) {
        // Active sweeps check
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]), // none active
          }),
        };
      }
      // Deposits for amount
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ amount: '1000', token: 'USDT' }]),
        }),
      };
    }),
    query: {
      wallets: {
        findFirst: vi.fn().mockResolvedValue({ address: '0xHotSafe0001' }),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([sweepRow]),
      }),
    }),
  };
}

/** DB mock for recordSweepBroadcasted */
function buildBroadcastDb() {
  return {
    query: {
      sweeps: { findFirst: vi.fn().mockResolvedValue(makeSweepRow()) },
    },
    update: makeUpdateMock([makeSweepRow({ status: 'submitted', txHash: TX_HASH })]),
    insert: makeInsertMock([]),
  };
}

/** DB mock for recordSweepConfirmed */
function buildConfirmDb() {
  const ua = makeUserAddress();
  return {
    query: {
      sweeps: { findFirst: vi.fn().mockResolvedValue(makeSweepRow({ status: 'submitted' })) },
    },
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
        query: {
          userAddresses: { findFirst: vi.fn().mockResolvedValue(ua) },
        },
        insert: makeInsertMock([]),
      };
      return cb(tx);
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sweep E2E dev-mode happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Phase 1 — scanSweepCandidates returns addresses above threshold', async () => {
    const db = buildCandidateDb();
    const candidates = await scanSweepCandidates(
      db as unknown as Parameters<typeof scanSweepCandidates>[0],
      'bnb',
      undefined,
      100 // min threshold
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      userAddressId: UA_ID,
      userId: USER_ID,
      chain: 'bnb',
      creditedUsdt: '1500',
      estimatedUsd: 1500,
    });
  });

  it('Phase 2 — createSweeps inserts row + enqueues job + emits socket event', async () => {
    const db = buildCreateDb();
    const io = makeMockIo();
    const queue = makeMockQueue();

    const result = await createSweeps(
      db as unknown as Parameters<typeof createSweeps>[0],
      [UA_ID],
      STAFF_ID,
      queue as unknown as Parameters<typeof createSweeps>[3],
      io as unknown as Parameters<typeof createSweeps>[4]
    );

    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({ userAddressId: UA_ID });
    expect(result.skipped).toHaveLength(0);

    expect(queue._add).toHaveBeenCalledWith(
      SWEEP_EXECUTE_QUEUE,
      expect.objectContaining({ userAddressId: UA_ID, chain: 'bnb' }),
      expect.objectContaining({ jobId: expect.stringContaining('sweep_execute_') })
    );

    expect(io._emit).toHaveBeenCalledWith(
      'sweep.started',
      expect.objectContaining({ fromAddr: '0xUserHdAddress0001', chain: 'bnb' })
    );
  });

  it('Phase 3 — recordSweepBroadcasted updates status + emits sweep.broadcast', async () => {
    const db = buildBroadcastDb();
    const io = makeMockIo();

    await recordSweepBroadcasted(
      db as unknown as Parameters<typeof recordSweepBroadcasted>[0],
      SWEEP_ID,
      TX_HASH,
      io as unknown as Parameters<typeof recordSweepBroadcasted>[3]
    );

    expect(db.update).toHaveBeenCalled();
    expect(io._emit).toHaveBeenCalledWith(
      'sweep.broadcast',
      expect.objectContaining({ sweepId: SWEEP_ID, txHash: TX_HASH })
    );
  });

  it('Phase 4 — recordSweepConfirmed finalises sweep + emits sweep.confirmed', async () => {
    const db = buildConfirmDb();
    const io = makeMockIo();

    await recordSweepConfirmed(
      db as unknown as Parameters<typeof recordSweepConfirmed>[0],
      SWEEP_ID,
      io as unknown as Parameters<typeof recordSweepConfirmed>[2]
    );

    expect(db.transaction).toHaveBeenCalled();
    expect(io._emit).toHaveBeenCalledWith(
      'sweep.confirmed',
      expect.objectContaining({ sweepId: SWEEP_ID, status: 'confirmed' })
    );
  });

  it('createSweeps skips addresses that already have an active sweep', async () => {
    const db = buildCreateDb();
    // Override active sweeps check to return one existing active sweep
    let selectCall = 0;
    db.select = vi.fn().mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([makeUserAddress()]),
          }),
        };
      }
      // Active sweeps — return one for UA_ID
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ userAddressId: UA_ID }]),
        }),
      };
    });

    const io = makeMockIo();
    const queue = makeMockQueue();
    const result = await createSweeps(
      db as unknown as Parameters<typeof createSweeps>[0],
      [UA_ID],
      STAFF_ID,
      queue as unknown as Parameters<typeof createSweeps>[3],
      io as unknown as Parameters<typeof createSweeps>[4]
    );

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({
      userAddressId: UA_ID,
      reason: 'active_sweep_exists',
    });
    expect(queue._add).not.toHaveBeenCalled();
  });

  it('scanSweepCandidates returns empty list when no credited deposits exist', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const candidates = await scanSweepCandidates(
      db as unknown as Parameters<typeof scanSweepCandidates>[0]
    );
    expect(candidates).toHaveLength(0);
  });
});
