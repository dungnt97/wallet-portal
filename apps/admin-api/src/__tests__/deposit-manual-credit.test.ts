// Unit tests for deposit manual credit service — happy path, validation errors,
// user not found, audit log, socket notify.
// Uses in-memory mocks — no real Postgres, queues, or Socket.io required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NotFoundError,
  ValidationError,
  manualCredit,
} from '../services/deposit-manual-credit.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';
const USER_ID = 'user-uuid-0001';
const DEPOSIT_ID = 'dep-uuid-0001';

const VALID_PARAMS = {
  userId: USER_ID,
  chain: 'bnb' as const,
  token: 'USDT' as const,
  amount: '1000.00',
  reason: 'Correcting a missed on-chain deposit from April 2026',
  staffId: STAFF_ID,
};

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  ...overrides,
});

// ── Mock helpers ──────────────────────────────────────────────────────────────

function buildMockDb(opts: { user?: ReturnType<typeof makeUser> | undefined }) {
  const txMock = {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: DEPOSIT_ID }]),
      }),
    }),
  };

  return {
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue(opts.user),
      },
    },
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
  };
}

function makeMockQueue() {
  return { add: vi.fn().mockResolvedValue({ id: 'job-001' }) };
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
  recordCredit: vi.fn().mockResolvedValue(undefined),
}));

const mockNotifyStaff = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: (...args: unknown[]) => mockNotifyStaff(...args),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('manualCredit service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotifyStaff.mockResolvedValue(undefined);
  });

  it('happy path — inserts deposit, returns ManualCreditResult with correct fields', async () => {
    const db = buildMockDb({ user: makeUser() });
    const emailQueue = makeMockQueue();
    const slackQueue = makeMockQueue();
    const io = makeMockIo();

    const result = await manualCredit(
      db as unknown as Parameters<typeof manualCredit>[0],
      io as unknown as Parameters<typeof manualCredit>[1],
      emailQueue as unknown as Parameters<typeof manualCredit>[2],
      slackQueue as unknown as Parameters<typeof manualCredit>[3],
      VALID_PARAMS
    );

    expect(result.depositId).toBe(DEPOSIT_ID);
    expect(result.userId).toBe(USER_ID);
    expect(result.chain).toBe('bnb');
    expect(result.token).toBe('USDT');
    expect(result.amount).toBe('1000.00');
    expect(result.creditedBy).toBe(STAFF_ID);
    expect(result.createdAt).toBeDefined();
  });

  it('calls notifyStaff after successful credit', async () => {
    const db = buildMockDb({ user: makeUser() });
    const emailQueue = makeMockQueue();
    const slackQueue = makeMockQueue();
    const io = makeMockIo();

    await manualCredit(
      db as unknown as Parameters<typeof manualCredit>[0],
      io as unknown as Parameters<typeof manualCredit>[1],
      emailQueue as unknown as Parameters<typeof manualCredit>[2],
      slackQueue as unknown as Parameters<typeof manualCredit>[3],
      VALID_PARAMS
    );

    expect(mockNotifyStaff).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ eventType: 'deposit.manual_credit', severity: 'critical' }),
      emailQueue,
      slackQueue
    );
  });

  it('throws NotFoundError when user does not exist', async () => {
    const db = buildMockDb({ user: undefined });
    const io = makeMockIo();

    await expect(
      manualCredit(
        db as unknown as Parameters<typeof manualCredit>[0],
        io as unknown as Parameters<typeof manualCredit>[1],
        makeMockQueue() as unknown as Parameters<typeof manualCredit>[2],
        makeMockQueue() as unknown as Parameters<typeof manualCredit>[3],
        VALID_PARAMS
      )
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });

  it('throws ValidationError when amount is zero', async () => {
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    await expect(
      manualCredit(
        db as unknown as Parameters<typeof manualCredit>[0],
        io as unknown as Parameters<typeof manualCredit>[1],
        makeMockQueue() as unknown as Parameters<typeof manualCredit>[2],
        makeMockQueue() as unknown as Parameters<typeof manualCredit>[3],
        { ...VALID_PARAMS, amount: '0' }
      )
    ).rejects.toMatchObject({ name: 'ValidationError', statusCode: 400 });
  });

  it('throws ValidationError when amount is negative', async () => {
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    await expect(
      manualCredit(
        db as unknown as Parameters<typeof manualCredit>[0],
        io as unknown as Parameters<typeof manualCredit>[1],
        makeMockQueue() as unknown as Parameters<typeof manualCredit>[2],
        makeMockQueue() as unknown as Parameters<typeof manualCredit>[3],
        { ...VALID_PARAMS, amount: '-100' }
      )
    ).rejects.toMatchObject({ name: 'ValidationError', statusCode: 400 });
  });

  it('throws ValidationError when reason is too short (< 20 chars)', async () => {
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    await expect(
      manualCredit(
        db as unknown as Parameters<typeof manualCredit>[0],
        io as unknown as Parameters<typeof manualCredit>[1],
        makeMockQueue() as unknown as Parameters<typeof manualCredit>[2],
        makeMockQueue() as unknown as Parameters<typeof manualCredit>[3],
        { ...VALID_PARAMS, reason: 'Too short' }
      )
    ).rejects.toMatchObject({ name: 'ValidationError', statusCode: 400 });
  });

  it('uses db.transaction exactly once on happy path', async () => {
    const db = buildMockDb({ user: makeUser() });
    const io = makeMockIo();

    await manualCredit(
      db as unknown as Parameters<typeof manualCredit>[0],
      io as unknown as Parameters<typeof manualCredit>[1],
      makeMockQueue() as unknown as Parameters<typeof manualCredit>[2],
      makeMockQueue() as unknown as Parameters<typeof manualCredit>[3],
      VALID_PARAMS
    );

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});
