// Unit tests for ceremony cancel service.
// Covers: cancel pending ceremony, reject if already broadcast, idempotent on already-cancelled.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelCeremony } from '../services/signer-ceremony-cancel.service.js';
import { ConflictError, NotFoundError } from '../services/signer-ceremony-validate.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-canceller-001';
const CEREMONY_ID = 'ceremony-uuid-cancel-001';
const BNB_OP_ID = 'op-uuid-bnb-cancel';
const SOL_OP_ID = 'op-uuid-sol-cancel';

function makeCeremony(overrides: Record<string, unknown> = {}) {
  return {
    id: CEREMONY_ID,
    operationType: 'signer_add',
    initiatedBy: 'staff-init',
    targetAdd: ['staff-target'],
    targetRemove: [],
    status: 'pending',
    reason: 'test',
    chainStates: {
      bnb: { status: 'pending', multisigOpId: BNB_OP_ID },
      solana: { status: 'pending', multisigOpId: SOL_OP_ID },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Mock builders ─────────────────────────────────────────────────────────────

function buildMockDb(ceremony: unknown) {
  const updateMock = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });

  const insertMock = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
    }),
  });

  const txMock = { update: updateMock, insert: insertMock };

  return {
    query: {
      signerCeremonies: {
        findFirst: vi.fn().mockResolvedValue(ceremony),
      },
    },
    update: updateMock,
    insert: insertMock,
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cancelCeremony', () => {
  let db: ReturnType<typeof buildMockDb>;

  beforeEach(() => {
    db = buildMockDb(makeCeremony());
  });

  it('successfully cancels a pending ceremony and expires multisig ops', async () => {
    await expect(cancelCeremony(db as never, CEREMONY_ID, STAFF_ID)).resolves.toBeUndefined();

    // Transaction was executed
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it('successfully cancels an in_progress ceremony (no chain broadcast yet)', async () => {
    db = buildMockDb(
      makeCeremony({
        status: 'in_progress',
        chainStates: {
          bnb: { status: 'signing', multisigOpId: BNB_OP_ID },
          solana: { status: 'pending', multisigOpId: SOL_OP_ID },
        },
      })
    );

    await expect(cancelCeremony(db as never, CEREMONY_ID, STAFF_ID)).resolves.toBeUndefined();
  });

  it('is idempotent — returns without error if already cancelled', async () => {
    db = buildMockDb(makeCeremony({ status: 'cancelled' }));

    await expect(cancelCeremony(db as never, CEREMONY_ID, STAFF_ID)).resolves.toBeUndefined();

    // No transaction needed for idempotent cancel
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when ceremony does not exist', async () => {
    db = buildMockDb(undefined);

    await expect(cancelCeremony(db as never, CEREMONY_ID, STAFF_ID)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('throws ConflictError when ceremony is already confirmed', async () => {
    db = buildMockDb(makeCeremony({ status: 'confirmed' }));

    await expect(cancelCeremony(db as never, CEREMONY_ID, STAFF_ID)).rejects.toBeInstanceOf(
      ConflictError
    );

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('throws ConflictError when ceremony is partial (one chain broadcast)', async () => {
    db = buildMockDb(makeCeremony({ status: 'partial' }));

    await expect(cancelCeremony(db as never, CEREMONY_ID, STAFF_ID)).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('throws ConflictError when a chain state is already executing', async () => {
    db = buildMockDb(
      makeCeremony({
        status: 'in_progress',
        chainStates: {
          bnb: { status: 'executing', multisigOpId: BNB_OP_ID },
          solana: { status: 'pending', multisigOpId: SOL_OP_ID },
        },
      })
    );

    await expect(cancelCeremony(db as never, CEREMONY_ID, STAFF_ID)).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('throws ConflictError when a chain state is confirmed (one chain done)', async () => {
    db = buildMockDb(
      makeCeremony({
        status: 'in_progress',
        chainStates: {
          bnb: { status: 'confirmed', multisigOpId: BNB_OP_ID, txHash: '0xabc' },
          solana: { status: 'pending', multisigOpId: SOL_OP_ID },
        },
      })
    );

    await expect(cancelCeremony(db as never, CEREMONY_ID, STAFF_ID)).rejects.toBeInstanceOf(
      ConflictError
    );
  });
});
