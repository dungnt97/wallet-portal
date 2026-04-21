// Unit tests for signer-rotate service.
// Covers: post-state threshold guard, overlap guard, success path with single ceremony.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock notify-staff so DB.select/getStaffIdsByRole is never invoked in unit tests.
vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

import { ValidationError } from '../services/signer-ceremony-validate.service.js';
import { rotateSigners } from '../services/signer-rotate.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INITIATOR_ID = 'staff-uuid-init-001';
const ADD_STAFF_1 = 'staff-uuid-add-001';
const ADD_STAFF_2 = 'staff-uuid-add-002';
const REMOVE_STAFF_1 = 'staff-uuid-remove-001';
const REMOVE_STAFF_2 = 'staff-uuid-remove-002';
const CEREMONY_ID = 'ceremony-uuid-rotate-001';
const BNB_OP_ID = 'op-uuid-bnb-rotate-001';
const SOL_OP_ID = 'op-uuid-sol-rotate-001';

const makeStaff = (id: string, role = 'staff', status = 'active') => ({
  id,
  name: `Staff ${id.slice(-4)}`,
  email: `${id.slice(-4)}@treasury.io`,
  role,
  status,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeBnbKey = (staffId: string) => ({
  id: `key-bnb-${staffId}`,
  staffId,
  chain: 'bnb',
  address: `0x${staffId}`,
  tier: 'hot',
  walletType: 'ledger',
  hwAttested: true,
  registeredAt: new Date(),
  revokedAt: null,
});

const makeSolKey = (staffId: string) => ({
  id: `key-sol-${staffId}`,
  staffId,
  chain: 'sol',
  address: `Sol${staffId}`,
  tier: 'hot',
  walletType: 'phantom',
  hwAttested: false,
  registeredAt: new Date(),
  revokedAt: null,
});

// ── Mock builders ─────────────────────────────────────────────────────────────

function buildMockDb(opts: {
  treasurerCount?: number;
  addStaffIds?: string[];
  removeStaffIds?: string[];
  addStaffStatus?: string;
  addHasKeys?: boolean;
  ceremonyRow?: unknown;
}) {
  const treasurerCount = opts.treasurerCount ?? 3;
  const addStaffIds = opts.addStaffIds ?? [ADD_STAFF_1, ADD_STAFF_2];
  const removeStaffIds = opts.removeStaffIds ?? [REMOVE_STAFF_1, REMOVE_STAFF_2];
  const addStaffStatus = opts.addStaffStatus ?? 'active';
  const addHasKeys = opts.addHasKeys !== false;

  const activeTreasurers = Array.from({ length: treasurerCount }, (_, i) =>
    makeStaff(`staff-t-${i}`, 'treasurer')
  );

  // findFirst: first N calls return add-staff, then remove-staff (treasurers)
  const addStaffList = addStaffIds.map((id) => makeStaff(id, 'staff', addStaffStatus));
  const removeStaffList = removeStaffIds.map((id) => makeStaff(id, 'treasurer'));
  const allStaff = [...addStaffList, ...removeStaffList];
  let findFirstIdx = 0;
  const findFirstMock = vi.fn().mockImplementation(() => {
    const s = allStaff[findFirstIdx] ?? allStaff[allStaff.length - 1];
    findFirstIdx++;
    return Promise.resolve(s);
  });

  // findMany: keys for add targets (BNB + Solana) or empty if addHasKeys=false
  const findManyMock = vi.fn().mockImplementation(async () => {
    if (!addHasKeys) return [];
    return [makeBnbKey('any'), makeSolKey('any')];
  });

  // findMany for getActiveTreasurerCount
  const findManyCountMock = vi.fn().mockResolvedValue(activeTreasurers);

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
        findFirst: findFirstMock,
        findMany: findManyCountMock,
      },
      staffSigningKeys: { findMany: findManyMock },
    },
    insert: insertMock,
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
  };
}

const makeMockIo = () => ({ of: vi.fn().mockReturnValue({ emit: vi.fn() }) });
const makeMockQueue = () => ({ add: vi.fn().mockResolvedValue({ id: 'job-1' }) });
const makeMockEmailQueue = () => ({ add: vi.fn().mockResolvedValue({}) });
const makeMockSlackQueue = () => ({ add: vi.fn().mockResolvedValue({}) });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('rotateSigners', () => {
  let db: ReturnType<typeof buildMockDb>;
  let ceremonyQueue: ReturnType<typeof makeMockQueue>;

  beforeEach(() => {
    db = buildMockDb({});
    ceremonyQueue = makeMockQueue();
  });

  it('creates single ceremony with both target_add + target_remove populated', async () => {
    const result = await rotateSigners(
      db as never,
      INITIATOR_ID,
      {
        addStaffIds: [ADD_STAFF_1, ADD_STAFF_2],
        removeStaffIds: [REMOVE_STAFF_1, REMOVE_STAFF_2],
        reason: 'Quarterly rotation',
      },
      makeMockIo() as never,
      ceremonyQueue as never,
      makeMockEmailQueue() as never,
      makeMockSlackQueue() as never
    );

    expect(result.ceremonyId).toBe(CEREMONY_ID);
    expect(result.bnbOpId).toBe(BNB_OP_ID);
    expect(result.solanaOpId).toBe(SOL_OP_ID);

    // Two jobs: one per chain
    expect(ceremonyQueue.add).toHaveBeenCalledTimes(2);
    const chains = ceremonyQueue.add.mock.calls.map((c) => c[1].chain);
    expect(chains).toContain('bnb');
    expect(chains).toContain('sol');
  });

  it('throws ValidationError when resulting set drops below MIN_THRESHOLD', async () => {
    // 3 current treasurers + 0 adds - 3 removes = 0 → below threshold
    db = buildMockDb({
      treasurerCount: 3,
      addStaffIds: [],
      removeStaffIds: [REMOVE_STAFF_1, REMOVE_STAFF_2, 'staff-t-2'],
    });

    await expect(
      rotateSigners(
        db as never,
        INITIATOR_ID,
        {
          addStaffIds: [ADD_STAFF_1],
          removeStaffIds: [REMOVE_STAFF_1, REMOVE_STAFF_2, 'extra'],
          reason: 'test',
        },
        makeMockIo() as never,
        makeMockQueue() as never,
        makeMockEmailQueue() as never,
        makeMockSlackQueue() as never
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when same staff id appears in both add and remove lists', async () => {
    await expect(
      rotateSigners(
        db as never,
        INITIATOR_ID,
        {
          addStaffIds: [ADD_STAFF_1],
          removeStaffIds: [ADD_STAFF_1], // overlap!
          reason: 'test',
        },
        makeMockIo() as never,
        makeMockQueue() as never,
        makeMockEmailQueue() as never,
        makeMockSlackQueue() as never
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when add target has no signing keys', async () => {
    db = buildMockDb({ addHasKeys: false });

    await expect(
      rotateSigners(
        db as never,
        INITIATOR_ID,
        {
          addStaffIds: [ADD_STAFF_1],
          removeStaffIds: [REMOVE_STAFF_1],
          reason: 'test',
        },
        makeMockIo() as never,
        makeMockQueue() as never,
        makeMockEmailQueue() as never,
        makeMockSlackQueue() as never
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
