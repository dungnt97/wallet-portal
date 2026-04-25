// Unit tests for cold timelock scheduler — reconcileExpiredTimelocks,
// notifyExpiringSoon, startColdTimelockScheduler cleanup.
// Uses in-memory mocks — no real Postgres, BullMQ, or Socket.io required.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyExpiringSoon,
  reconcileExpiredTimelocks,
  startColdTimelockScheduler,
} from '../services/cold-timelock-scheduler.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockNotifyStaff = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: (...args: unknown[]) => mockNotifyStaff(...args),
}));

// withdrawal-create exports COLD_TIMELOCK_QUEUE constant — keep real value
vi.mock('../services/withdrawal-create.service.js', () => ({
  COLD_TIMELOCK_QUEUE: 'cold_timelock_broadcast',
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WD_ID_1 = 'wd-uuid-0001';
const WD_ID_2 = 'wd-uuid-0002';

const makeExpiredRow = (id = WD_ID_1) => ({ id });

const makeExpiringSoonRow = (id = WD_ID_1) => ({
  id,
  timeLockExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min from now
});

// ── Mock helpers ──────────────────────────────────────────────────────────────

/** DB mock for reconcileExpiredTimelocks — single select returning expiredRows */
function buildReconcileDb(expiredRows: { id: string }[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(expiredRows),
      }),
    }),
  };
}

/** DB mock for notifyExpiringSoon — single select returning expiringSoonRows */
function buildNotifyDb(expiringSoonRows: { id: string; timeLockExpiresAt: Date }[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(expiringSoonRows),
      }),
    }),
  };
}

/** DB mock for scheduler boot tests — returns expiredRows on first select */
function buildSchedulerDb(expiredRows: { id: string }[]) {
  return buildReconcileDb(expiredRows);
}

function makeMockQueue() {
  return { add: vi.fn().mockResolvedValue({ id: 'job-001' }) };
}

function makeMockIo() {
  const emitFn = vi.fn();
  return { of: vi.fn().mockReturnValue({ emit: emitFn }), _emit: emitFn };
}

function makeMockEmailQueue() {
  return { add: vi.fn().mockResolvedValue({ id: 'email-job-001' }) };
}

function makeMockSlackQueue() {
  return { add: vi.fn().mockResolvedValue({ id: 'slack-job-001' }) };
}

// ── reconcileExpiredTimelocks tests ───────────────────────────────────────────

describe('reconcileExpiredTimelocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when no expired timelocks exist', async () => {
    const db = buildReconcileDb([]);
    const queue = makeMockQueue();

    const count = await reconcileExpiredTimelocks(
      db as unknown as Parameters<typeof reconcileExpiredTimelocks>[0],
      queue as unknown as Parameters<typeof reconcileExpiredTimelocks>[1]
    );

    expect(count).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues one job per expired withdrawal', async () => {
    const db = buildReconcileDb([makeExpiredRow(WD_ID_1), makeExpiredRow(WD_ID_2)]);
    const queue = makeMockQueue();

    const count = await reconcileExpiredTimelocks(
      db as unknown as Parameters<typeof reconcileExpiredTimelocks>[0],
      queue as unknown as Parameters<typeof reconcileExpiredTimelocks>[1]
    );

    expect(count).toBe(2);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      'cold_timelock_broadcast',
      { withdrawalId: WD_ID_1 },
      expect.objectContaining({ jobId: WD_ID_1, delay: 0 })
    );
  });

  it('continues on individual job enqueue failure and returns partial count', async () => {
    const db = buildReconcileDb([makeExpiredRow(WD_ID_1), makeExpiredRow(WD_ID_2)]);
    const queue = makeMockQueue();
    // First call succeeds, second throws
    queue.add
      .mockResolvedValueOnce({ id: 'job-ok' })
      .mockRejectedValueOnce(new Error('BullMQ down'));

    const count = await reconcileExpiredTimelocks(
      db as unknown as Parameters<typeof reconcileExpiredTimelocks>[0],
      queue as unknown as Parameters<typeof reconcileExpiredTimelocks>[1]
    );

    // Only the first succeeded
    expect(count).toBe(1);
  });
});

// ── notifyExpiringSoon tests ──────────────────────────────────────────────────

describe('notifyExpiringSoon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotifyStaff.mockResolvedValue(undefined);
  });

  it('calls notifyStaff for each expiring-soon withdrawal', async () => {
    const db = buildNotifyDb([makeExpiringSoonRow(WD_ID_1), makeExpiringSoonRow(WD_ID_2)]);
    const io = makeMockIo();
    const emailQueue = makeMockEmailQueue();
    const slackQueue = makeMockSlackQueue();

    await notifyExpiringSoon(
      db as unknown as Parameters<typeof notifyExpiringSoon>[0],
      io as unknown as Parameters<typeof notifyExpiringSoon>[1],
      emailQueue as unknown as Parameters<typeof notifyExpiringSoon>[2],
      slackQueue as unknown as Parameters<typeof notifyExpiringSoon>[3]
    );

    expect(mockNotifyStaff).toHaveBeenCalledTimes(2);
    expect(mockNotifyStaff).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ eventType: 'cold.timelock.expiring', severity: 'warning' }),
      emailQueue,
      slackQueue
    );
  });

  it('skips notify when no expiring-soon rows exist', async () => {
    const db = buildNotifyDb([]);
    const io = makeMockIo();

    await notifyExpiringSoon(
      db as unknown as Parameters<typeof notifyExpiringSoon>[0],
      io as unknown as Parameters<typeof notifyExpiringSoon>[1],
      makeMockEmailQueue() as unknown as Parameters<typeof notifyExpiringSoon>[2],
      makeMockSlackQueue() as unknown as Parameters<typeof notifyExpiringSoon>[3]
    );

    expect(mockNotifyStaff).not.toHaveBeenCalled();
  });
});

// ── startColdTimelockScheduler tests ─────────────────────────────────────────

describe('startColdTimelockScheduler', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns a cleanup function that can be called without error', () => {
    const db = buildSchedulerDb([]);
    const queue = makeMockQueue();

    const stop = startColdTimelockScheduler(
      db as unknown as Parameters<typeof startColdTimelockScheduler>[0],
      queue as unknown as Parameters<typeof startColdTimelockScheduler>[1]
    );

    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
  });

  it('triggers on-boot reconciliation immediately', async () => {
    const db = buildSchedulerDb([makeExpiredRow(WD_ID_1)]);
    const queue = makeMockQueue();

    const stop = startColdTimelockScheduler(
      db as unknown as Parameters<typeof startColdTimelockScheduler>[0],
      queue as unknown as Parameters<typeof startColdTimelockScheduler>[1]
    );
    stop();

    // Flush microtasks — the on-boot reconciliation is fire-and-forget (Promise chain)
    // Multiple awaits drain the microtask queue in Vitest 1.x
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // The select was called as part of reconciliation boot
    expect(db.select).toHaveBeenCalled();
  });
});
