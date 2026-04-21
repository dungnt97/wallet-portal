// Unit tests for signer-remove service.
// Covers: quorum threshold guard, non-treasurer rejection, success path.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock notify-staff so DB.select/getStaffIdsByRole is never invoked in unit tests.
vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

import { ValidationError } from '../services/signer-ceremony-validate.service.js';
import { removeSigner } from '../services/signer-remove.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INITIATOR_ID = 'staff-uuid-init-001';
const TARGET_ID = 'staff-uuid-target-001';
const CEREMONY_ID = 'ceremony-uuid-remove-001';
const BNB_OP_ID = 'op-uuid-bnb-remove-001';
const SOL_OP_ID = 'op-uuid-sol-remove-001';

const makeTreasurer = (overrides = {}) => ({
  id: TARGET_ID,
  name: 'Bob Treasurer',
  email: 'bob@treasury.io',
  role: 'treasurer',
  status: 'active',
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ── Mock builders ─────────────────────────────────────────────────────────────

function buildMockDb(opts: {
  staff?: unknown;
  treasurerCount?: number;
  ceremonyRow?: unknown;
}) {
  const staff = opts.staff ?? makeTreasurer();
  const treasurerCount = opts.treasurerCount ?? 3;

  // staffMembers.findMany returns `treasurerCount` treasurer rows (for getActiveTreasurerCount)
  const activeTreasurers = Array.from({ length: treasurerCount }, (_, i) => ({
    id: `staff-t-${i}`,
    role: 'treasurer',
    status: 'active',
  }));

  let insertCount = 0;
  const insertMock = vi.fn().mockImplementation(() => {
    insertCount++;
    const row =
      insertCount === 1
        ? [{ id: BNB_OP_ID }]
        : insertCount === 2
          ? [{ id: SOL_OP_ID }]
          : insertCount === 3
            ? [opts.ceremonyRow ?? { id: CEREMONY_ID }]
            : [];
    const returning = vi.fn().mockResolvedValue(row);
    return { values: vi.fn().mockReturnValue({ returning }) };
  });

  const txMock = { insert: insertMock };

  return {
    query: {
      staffMembers: {
        findFirst: vi.fn().mockResolvedValue(staff),
        findMany: vi.fn().mockResolvedValue(activeTreasurers),
      },
    },
    insert: insertMock,
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
  };
}

function makeMockIo() {
  const emit = vi.fn();
  return { of: vi.fn().mockReturnValue({ emit }) };
}

const makeMockQueue = () => ({ add: vi.fn().mockResolvedValue({ id: 'job-1' }) });
const makeMockEmailQueue = () => ({ add: vi.fn().mockResolvedValue({ id: 'e-1' }) });
const makeMockSlackQueue = () => ({ add: vi.fn().mockResolvedValue({ id: 's-1' }) });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('removeSigner', () => {
  let db: ReturnType<typeof buildMockDb>;
  let io: ReturnType<typeof makeMockIo>;
  let ceremonyQueue: ReturnType<typeof makeMockQueue>;

  beforeEach(() => {
    db = buildMockDb({});
    io = makeMockIo();
    ceremonyQueue = makeMockQueue();
  });

  it('creates ceremony + enqueues both chain jobs on success (3 treasurers → 2)', async () => {
    const result = await removeSigner(
      db as never,
      INITIATOR_ID,
      { targetStaffId: TARGET_ID, reason: 'Offboarding' },
      io as never,
      ceremonyQueue as never,
      makeMockEmailQueue() as never,
      makeMockSlackQueue() as never
    );

    expect(result.ceremonyId).toBe(CEREMONY_ID);
    expect(result.bnbOpId).toBe(BNB_OP_ID);
    expect(result.solanaOpId).toBe(SOL_OP_ID);

    expect(ceremonyQueue.add).toHaveBeenCalledTimes(2);
    const jobPayloads = ceremonyQueue.add.mock.calls.map((c) => c[1]);
    expect(jobPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chain: 'bnb' }),
        expect.objectContaining({ chain: 'sol' }),
      ])
    );
  });

  it('throws ValidationError when target is not a treasurer', async () => {
    db.query.staffMembers.findFirst = vi.fn().mockResolvedValue(makeTreasurer({ role: 'staff' }));

    await expect(
      removeSigner(
        db as never,
        INITIATOR_ID,
        { targetStaffId: TARGET_ID, reason: 'test' },
        io as never,
        ceremonyQueue as never,
        makeMockEmailQueue() as never,
        makeMockSlackQueue() as never
      )
    ).rejects.toBeInstanceOf(ValidationError);

    expect(ceremonyQueue.add).not.toHaveBeenCalled();
  });

  it('throws ValidationError when removal would drop below MIN_THRESHOLD (2 treasurers → 1)', async () => {
    db = buildMockDb({ treasurerCount: 2 }); // post-remove = 1 → below threshold

    await expect(
      removeSigner(
        db as never,
        INITIATOR_ID,
        { targetStaffId: TARGET_ID, reason: 'test' },
        io as never,
        makeMockQueue() as never,
        makeMockEmailQueue() as never,
        makeMockSlackQueue() as never
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('allows removal when post-count equals MIN_THRESHOLD exactly (3 → 2)', async () => {
    // Default db has 3 treasurers, post-remove = 2 — exactly at threshold, should pass
    const result = await removeSigner(
      db as never,
      INITIATOR_ID,
      { targetStaffId: TARGET_ID, reason: 'Offboarding exactly at threshold' },
      io as never,
      ceremonyQueue as never,
      makeMockEmailQueue() as never,
      makeMockSlackQueue() as never
    );
    expect(result.ceremonyId).toBe(CEREMONY_ID);
  });
});
