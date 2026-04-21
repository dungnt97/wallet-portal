// Unit tests for signer-add service.
// Covers: ceremony row created, both chain jobs enqueued, notification sent,
// rejection when target staff missing, rejection when staff has no signing keys.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock notify-staff so DB.select/getStaffIdsByRole is never invoked in unit tests.
vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

import { addSigner } from '../services/signer-add.service.js';
import { NotFoundError, ValidationError } from '../services/signer-ceremony-validate.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INITIATOR_ID = 'staff-uuid-init-001';
const TARGET_ID = 'staff-uuid-target-001';
const CEREMONY_ID = 'ceremony-uuid-001';
const BNB_OP_ID = 'op-uuid-bnb-001';
const SOL_OP_ID = 'op-uuid-sol-001';

const makeActiveStaff = (overrides = {}) => ({
  id: TARGET_ID,
  name: 'Alice Test',
  email: 'alice@treasury.io',
  role: 'staff',
  status: 'active',
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeBnbKey = () => ({
  id: 'key-bnb-001',
  staffId: TARGET_ID,
  chain: 'bnb',
  address: '0xABC',
  tier: 'hot',
  walletType: 'ledger',
  hwAttested: true,
  registeredAt: new Date(),
  revokedAt: null,
});

const makeSolKey = () => ({
  id: 'key-sol-001',
  staffId: TARGET_ID,
  chain: 'sol',
  address: 'SolAddrABC',
  tier: 'hot',
  walletType: 'phantom',
  hwAttested: false,
  registeredAt: new Date(),
  revokedAt: null,
});

// ── Mock builders ─────────────────────────────────────────────────────────────

function makeInsertMock(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  return vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning }) });
}

function buildMockDb(opts: {
  staff?: unknown;
  keys?: unknown[];
  ceremonyRow?: unknown;
  opRow?: unknown;
}) {
  const staff = opts.staff ?? makeActiveStaff();
  const keys = opts.keys ?? [makeBnbKey(), makeSolKey()];

  let insertCount = 0;
  const insertMock = vi.fn().mockImplementation(() => {
    insertCount++;
    // 1st + 2nd inserts → multisig ops; 3rd → ceremony; 4th+ → audit
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
      staffMembers: { findFirst: vi.fn().mockResolvedValue(staff) },
      staffSigningKeys: { findMany: vi.fn().mockResolvedValue(keys) },
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

function makeMockQueue() {
  return { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
}

function makeMockEmailQueue() {
  return { add: vi.fn().mockResolvedValue({ id: 'email-job-1' }) };
}

function makeMockSlackQueue() {
  return { add: vi.fn().mockResolvedValue({ id: 'slack-job-1' }) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('addSigner', () => {
  let db: ReturnType<typeof buildMockDb>;
  let io: ReturnType<typeof makeMockIo>;
  let ceremonyQueue: ReturnType<typeof makeMockQueue>;
  let emailQueue: ReturnType<typeof makeMockEmailQueue>;
  let slackQueue: ReturnType<typeof makeMockSlackQueue>;

  beforeEach(() => {
    db = buildMockDb({});
    io = makeMockIo();
    ceremonyQueue = makeMockQueue();
    emailQueue = makeMockEmailQueue();
    slackQueue = makeMockSlackQueue();
  });

  it('creates ceremony + enqueues both chain jobs on success', async () => {
    const result = await addSigner(
      db as never,
      INITIATOR_ID,
      { targetStaffId: TARGET_ID, reason: 'Onboarding Alice' },
      io as never,
      ceremonyQueue as never,
      emailQueue as never,
      slackQueue as never
    );

    expect(result.ceremonyId).toBe(CEREMONY_ID);
    expect(result.bnbOpId).toBe(BNB_OP_ID);
    expect(result.solanaOpId).toBe(SOL_OP_ID);

    // Two BullMQ jobs enqueued — one per chain
    expect(ceremonyQueue.add).toHaveBeenCalledTimes(2);
    const calls = ceremonyQueue.add.mock.calls;
    expect(calls[0][1]).toMatchObject({ chain: 'bnb' });
    expect(calls[1][1]).toMatchObject({ chain: 'sol' });

    // Idempotent job ids
    expect(calls[0][2]).toMatchObject({ jobId: `ceremony:${CEREMONY_ID}:bnb` });
    expect(calls[1][2]).toMatchObject({ jobId: `ceremony:${CEREMONY_ID}:sol` });
  });

  it('emits signer.ceremony.created socket event', async () => {
    await addSigner(
      db as never,
      INITIATOR_ID,
      { targetStaffId: TARGET_ID, reason: 'test' },
      io as never,
      ceremonyQueue as never,
      emailQueue as never,
      slackQueue as never
    );

    const streamEmit = io.of('/stream').emit;
    expect(streamEmit).toHaveBeenCalledWith(
      'signer.ceremony.created',
      expect.objectContaining({ operationType: 'signer_add' })
    );
  });

  it('throws NotFoundError when target staff does not exist', async () => {
    db.query.staffMembers.findFirst = vi.fn().mockResolvedValue(undefined);

    await expect(
      addSigner(
        db as never,
        INITIATOR_ID,
        { targetStaffId: TARGET_ID, reason: 'test' },
        io as never,
        ceremonyQueue as never,
        emailQueue as never,
        slackQueue as never
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ValidationError when staff is not active', async () => {
    db.query.staffMembers.findFirst = vi
      .fn()
      .mockResolvedValue(makeActiveStaff({ status: 'suspended' }));

    await expect(
      addSigner(
        db as never,
        INITIATOR_ID,
        { targetStaffId: TARGET_ID, reason: 'test' },
        io as never,
        ceremonyQueue as never,
        emailQueue as never,
        slackQueue as never
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when target has no BNB signing key', async () => {
    // Only Solana key — BNB missing
    db.query.staffSigningKeys.findMany = vi.fn().mockResolvedValue([makeSolKey()]);

    await expect(
      addSigner(
        db as never,
        INITIATOR_ID,
        { targetStaffId: TARGET_ID, reason: 'test' },
        io as never,
        ceremonyQueue as never,
        emailQueue as never,
        slackQueue as never
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when target has no Solana signing key', async () => {
    db.query.staffSigningKeys.findMany = vi.fn().mockResolvedValue([makeBnbKey()]);

    await expect(
      addSigner(
        db as never,
        INITIATOR_ID,
        { targetStaffId: TARGET_ID, reason: 'test' },
        io as never,
        ceremonyQueue as never,
        emailQueue as never,
        slackQueue as never
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
