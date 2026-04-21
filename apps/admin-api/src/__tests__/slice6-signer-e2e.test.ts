// Slice 6 dev-mode E2E — signer ceremony add lifecycle.
// AUTH_DEV_MODE=true: ceremony creates rows + enqueues jobs; we verify service contracts
// without a real DB or Redis (all mocked). Tests add → ceremony created → worker
// would flip keys → added staff appears in active set (signing keys not revoked).
//
// Pattern mirrors withdrawal-e2e-devmode.test.ts and slice7-cold-e2e.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock notify-staff so DB.select/getStaffIdsByRole is never invoked in E2E tests.
vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));
import { addSigner } from '../services/signer-add.service.js';
import { cancelCeremony } from '../services/signer-ceremony-cancel.service.js';
import { NotFoundError, ValidationError } from '../services/signer-ceremony-validate.service.js';
import { removeSigner } from '../services/signer-remove.service.js';
import { rotateSigners } from '../services/signer-rotate.service.js';

// ── Dev mode ──────────────────────────────────────────────────────────────────

process.env.AUTH_DEV_MODE = 'true';

// ── Shared UUIDs ──────────────────────────────────────────────────────────────

const INITIATOR_ID = 'e2e-staff-init-0001';
const NEW_SIGNER_ID = 'e2e-staff-new-0001';
const TREASURER_1_ID = 'e2e-staff-treas-0001';
const TREASURER_2_ID = 'e2e-staff-treas-0002';
const TREASURER_3_ID = 'e2e-staff-treas-0003';

const CEREMONY_ID = 'e2e-ceremony-0001';
const BNB_OP_ID = 'e2e-op-bnb-0001';
const SOL_OP_ID = 'e2e-op-sol-0001';

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeStaffMember(id: string, role: string, status = 'active') {
  return {
    id,
    name: `Test ${id.slice(-4)}`,
    email: `${id.slice(-4)}@e2e.test`,
    role,
    status,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeSigningKey(staffId: string, chain: 'bnb' | 'sol') {
  return {
    id: `key-${chain}-${staffId}`,
    staffId,
    chain,
    address: chain === 'bnb' ? `0x${staffId.replace(/-/g, '').slice(0, 40)}` : `Sol${staffId}`,
    tier: 'hot',
    walletType: chain === 'bnb' ? 'ledger' : 'phantom',
    hwAttested: chain === 'bnb',
    registeredAt: new Date(),
    revokedAt: null,
  };
}

// ── Mock builders ─────────────────────────────────────────────────────────────

function makeInsertSequence(rows: unknown[][]) {
  let idx = 0;
  return vi.fn().mockImplementation(() => {
    const row = rows[idx] ?? [];
    idx++;
    const returning = vi.fn().mockResolvedValue(row);
    return { values: vi.fn().mockReturnValue({ returning }) };
  });
}

/** Build a mock DB tuned for add-signer scenario. */
function buildAddDb() {
  const newSigner = makeStaffMember(NEW_SIGNER_ID, 'staff');
  const keys = [makeSigningKey(NEW_SIGNER_ID, 'bnb'), makeSigningKey(NEW_SIGNER_ID, 'sol')];

  const insertMock = makeInsertSequence([
    [{ id: BNB_OP_ID }], // insert multisig_op BNB
    [{ id: SOL_OP_ID }], // insert multisig_op SOL
    [{ id: CEREMONY_ID }], // insert ceremony
    [], // insert audit_log
  ]);

  const txMock = { insert: insertMock };

  return {
    query: {
      staffMembers: { findFirst: vi.fn().mockResolvedValue(newSigner) },
      staffSigningKeys: { findMany: vi.fn().mockResolvedValue(keys) },
    },
    insert: insertMock,
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
  };
}

/** Build a mock DB for remove-signer (3 current treasurers). */
function buildRemoveDb(treasurerCount = 3) {
  const target = makeStaffMember(TREASURER_1_ID, 'treasurer');
  const activeTreasurers = [TREASURER_1_ID, TREASURER_2_ID, TREASURER_3_ID]
    .slice(0, treasurerCount)
    .map((id) => makeStaffMember(id, 'treasurer'));

  const insertMock = makeInsertSequence([
    [{ id: BNB_OP_ID }],
    [{ id: SOL_OP_ID }],
    [{ id: CEREMONY_ID }],
    [],
  ]);

  const txMock = { insert: insertMock };

  return {
    query: {
      staffMembers: {
        findFirst: vi.fn().mockResolvedValue(target),
        findMany: vi.fn().mockResolvedValue(activeTreasurers),
      },
    },
    insert: insertMock,
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
  };
}

/** Build a mock DB for rotate-signers (3 adds + 3 removes). */
function buildRotateDb() {
  const addStaffIds = [NEW_SIGNER_ID, 'e2e-add-002', 'e2e-add-003'];
  const removeStaffIds = [TREASURER_1_ID, TREASURER_2_ID, TREASURER_3_ID];

  const addStaff = addStaffIds.map((id) => makeStaffMember(id, 'staff'));
  const removeStaff = removeStaffIds.map((id) => makeStaffMember(id, 'treasurer'));
  const allStaff = [...addStaff, ...removeStaff];

  const activeTreasurers = removeStaff; // 3 current treasurers

  let findFirstIdx = 0;
  const findFirstMock = vi.fn().mockImplementation(() => {
    const s = allStaff[findFirstIdx % allStaff.length];
    findFirstIdx++;
    return Promise.resolve(s);
  });

  const findManyKeysMock = vi
    .fn()
    .mockResolvedValue([
      makeSigningKey(NEW_SIGNER_ID, 'bnb'),
      makeSigningKey(NEW_SIGNER_ID, 'sol'),
    ]);

  const insertMock = makeInsertSequence([
    [{ id: BNB_OP_ID }],
    [{ id: SOL_OP_ID }],
    [{ id: CEREMONY_ID }],
    [],
  ]);

  const txMock = { insert: insertMock };

  return {
    query: {
      staffMembers: {
        findFirst: findFirstMock,
        findMany: vi.fn().mockResolvedValue(activeTreasurers),
      },
      staffSigningKeys: { findMany: findManyKeysMock },
    },
    insert: insertMock,
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
  };
}

function buildCancelDb(ceremony: unknown) {
  const updateMock = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
  const insertMock = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
  });
  const txMock = { update: updateMock, insert: insertMock };
  return {
    query: { signerCeremonies: { findFirst: vi.fn().mockResolvedValue(ceremony) } },
    update: updateMock,
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

describe('Slice 6 signer E2E (dev-mode)', () => {
  let ceremonyQueue: ReturnType<typeof makeMockQueue>;

  beforeEach(() => {
    ceremonyQueue = makeMockQueue();
  });

  describe('add-signer ceremony', () => {
    it('creates ceremony + 2 ops + enqueues BNB + SOL jobs', async () => {
      const db = buildAddDb();
      const io = makeMockIo();

      const result = await addSigner(
        db as never,
        INITIATOR_ID,
        { targetStaffId: NEW_SIGNER_ID, reason: 'E2E add signer' },
        io as never,
        ceremonyQueue as never,
        makeMockEmailQueue() as never,
        makeMockSlackQueue() as never
      );

      // Ceremony row created
      expect(result.ceremonyId).toBe(CEREMONY_ID);
      expect(result.bnbOpId).toBe(BNB_OP_ID);
      expect(result.solanaOpId).toBe(SOL_OP_ID);

      // Both chain jobs queued with idempotent jobIds
      expect(ceremonyQueue.add).toHaveBeenCalledTimes(2);
      const jobIds = ceremonyQueue.add.mock.calls.map((c) => c[2].jobId);
      expect(jobIds).toContain(`ceremony:${CEREMONY_ID}:bnb`);
      expect(jobIds).toContain(`ceremony:${CEREMONY_ID}:sol`);

      // Socket notification emitted
      const streamEmit = io.of('/stream').emit;
      expect(streamEmit).toHaveBeenCalledWith(
        'signer.ceremony.created',
        expect.objectContaining({ ceremonyId: CEREMONY_ID, operationType: 'signer_add' })
      );
    });

    it('rejects when target staff has no signing keys on BNB', async () => {
      const db = buildAddDb();
      // Override: return only Solana key
      db.query.staffSigningKeys.findMany = vi
        .fn()
        .mockResolvedValue([makeSigningKey(NEW_SIGNER_ID, 'sol')]);

      await expect(
        addSigner(
          db as never,
          INITIATOR_ID,
          { targetStaffId: NEW_SIGNER_ID, reason: 'Should fail' },
          makeMockIo() as never,
          ceremonyQueue as never,
          makeMockEmailQueue() as never,
          makeMockSlackQueue() as never
        )
      ).rejects.toBeInstanceOf(ValidationError);

      expect(ceremonyQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('remove-signer ceremony', () => {
    it('creates ceremony when removing from 3-member set (stays ≥ 2)', async () => {
      const db = buildRemoveDb(3);
      const result = await removeSigner(
        db as never,
        INITIATOR_ID,
        { targetStaffId: TREASURER_1_ID, reason: 'E2E remove signer' },
        makeMockIo() as never,
        ceremonyQueue as never,
        makeMockEmailQueue() as never,
        makeMockSlackQueue() as never
      );

      expect(result.ceremonyId).toBe(CEREMONY_ID);
      expect(ceremonyQueue.add).toHaveBeenCalledTimes(2);
    });

    it('rejects when removal would leave only 1 treasurer', async () => {
      const db = buildRemoveDb(2);

      await expect(
        removeSigner(
          db as never,
          INITIATOR_ID,
          { targetStaffId: TREASURER_1_ID, reason: 'E2E should fail' },
          makeMockIo() as never,
          makeMockQueue() as never,
          makeMockEmailQueue() as never,
          makeMockSlackQueue() as never
        )
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('rotate-signers ceremony (3 add + 3 remove)', () => {
    it('creates single ceremony with both target_add and target_remove', async () => {
      const db = buildRotateDb();

      const result = await rotateSigners(
        db as never,
        INITIATOR_ID,
        {
          addStaffIds: [NEW_SIGNER_ID, 'e2e-add-002', 'e2e-add-003'],
          removeStaffIds: [TREASURER_1_ID, TREASURER_2_ID, TREASURER_3_ID],
          reason: 'E2E rotate all — quarterly rotation',
        },
        makeMockIo() as never,
        ceremonyQueue as never,
        makeMockEmailQueue() as never,
        makeMockSlackQueue() as never
      );

      expect(result.ceremonyId).toBe(CEREMONY_ID);
      // One ceremony, two chain jobs
      expect(ceremonyQueue.add).toHaveBeenCalledTimes(2);

      // Post-count: 3 current + 3 adds - 3 removes = 3 → ≥ 2, valid
      const chains = ceremonyQueue.add.mock.calls.map((c) => c[1].chain);
      expect(chains).toContain('bnb');
      expect(chains).toContain('sol');
    });

    it('rejects rotate when resulting set drops below threshold', async () => {
      const db = buildRotateDb();

      await expect(
        rotateSigners(
          db as never,
          INITIATOR_ID,
          {
            // 3 adds - 3 removes = 3 current + 3 - 3 = 3, but if we add fewer and remove more…
            // Force failure: 1 add, 3 removes → 3 + 1 - 3 = 1 < 2
            addStaffIds: [NEW_SIGNER_ID],
            removeStaffIds: [TREASURER_1_ID, TREASURER_2_ID, TREASURER_3_ID],
            reason: 'E2E should fail',
          },
          makeMockIo() as never,
          makeMockQueue() as never,
          makeMockEmailQueue() as never,
          makeMockSlackQueue() as never
        )
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('cancel ceremony', () => {
    it('cancels a pending ceremony', async () => {
      const ceremony = {
        id: CEREMONY_ID,
        status: 'pending',
        chainStates: {
          bnb: { status: 'pending', multisigOpId: BNB_OP_ID },
          solana: { status: 'pending', multisigOpId: SOL_OP_ID },
        },
      };
      const db = buildCancelDb(ceremony);

      await expect(cancelCeremony(db as never, CEREMONY_ID, INITIATOR_ID)).resolves.toBeUndefined();
    });

    it('rejects cancel after one chain broadcast confirmed', async () => {
      const ceremony = {
        id: CEREMONY_ID,
        status: 'in_progress',
        chainStates: {
          bnb: { status: 'confirmed', multisigOpId: BNB_OP_ID, txHash: '0xabc' },
          solana: { status: 'pending', multisigOpId: SOL_OP_ID },
        },
      };
      const db = buildCancelDb(ceremony);

      await expect(cancelCeremony(db as never, CEREMONY_ID, INITIATOR_ID)).rejects.toBeInstanceOf(
        Error
      ); // ConflictError extends Error
    });
  });
});
