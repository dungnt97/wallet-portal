// Unit tests for withdrawal approve service — happy path, status guard,
// duplicate approval, threshold met, socket emit.
// Uses in-memory mocks — no real Postgres or Policy Engine required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  NotFoundError,
  approveWithdrawal,
} from '../services/withdrawal-approve.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';
const WITHDRAWAL_ID = 'wd-uuid-0001';
const OP_ID = 'op-uuid-0001';
const KEY_ID = 'key-uuid-0001';

const VALID_INPUT = {
  signature: '0xdeadbeef',
  signerAddress: '0xSigner0001',
  signedAt: new Date().toISOString(),
  multisigOpId: OP_ID,
  chain: 'bnb' as const,
};

const makeWithdrawal = (overrides: Record<string, unknown> = {}) => ({
  id: WITHDRAWAL_ID,
  userId: 'user-uuid-0001',
  chain: 'bnb',
  token: 'USDT',
  amount: '1000',
  destinationAddr: '0xDest001',
  status: 'pending',
  sourceTier: 'hot',
  multisigOpId: OP_ID,
  timeLockExpiresAt: null,
  createdBy: STAFF_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeOp = (overrides: Record<string, unknown> = {}) => ({
  id: OP_ID,
  withdrawalId: WITHDRAWAL_ID,
  chain: 'bnb',
  operationType: 'withdrawal',
  multisigAddr: '0xMultisig001',
  requiredSigs: 2,
  collectedSigs: 0,
  expiresAt: new Date(Date.now() + 86_400_000), // +24h
  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeSigningKey = (overrides: Record<string, unknown> = {}) => ({
  id: KEY_ID,
  staffId: STAFF_ID,
  chain: 'bnb',
  address: '0xSigner0001',
  ...overrides,
});

// ── Mock builder helpers ──────────────────────────────────────────────────────

function makeUpdateMock(returnRows: unknown[] = [{ id: 'updated' }]) {
  return vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returnRows),
      }),
    }),
  });
}

function makeInsertMock() {
  return vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue([]),
  });
}

function buildMockDb(opts: {
  withdrawal?: ReturnType<typeof makeWithdrawal> | undefined;
  op?: ReturnType<typeof makeOp> | undefined;
  signingKey?: ReturnType<typeof makeSigningKey> | undefined;
  existingApproval?: Record<string, unknown> | undefined;
  updatedOp?: Record<string, unknown>;
}) {
  const updatedOp = opts.updatedOp ?? makeOp({ collectedSigs: 1 });
  const txMock = {
    insert: makeInsertMock(),
    update: makeUpdateMock([updatedOp]),
  };

  return {
    query: {
      withdrawals: { findFirst: vi.fn().mockResolvedValue(opts.withdrawal) },
      multisigOperations: { findFirst: vi.fn().mockResolvedValue(opts.op) },
      staffSigningKeys: { findFirst: vi.fn().mockResolvedValue(opts.signingKey) },
      multisigApprovals: { findFirst: vi.fn().mockResolvedValue(opts.existingApproval) },
    },
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
  };
}

function makeMockIo() {
  const emitFn = vi.fn();
  return { of: vi.fn().mockReturnValue({ emit: emitFn }), _emit: emitFn };
}

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockCheckPolicy = vi.fn();
vi.mock('../services/policy-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/policy-client.js')>();
  return { ...actual, checkPolicy: (...args: unknown[]) => mockCheckPolicy(...args) };
});

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('approveWithdrawal service', () => {
  beforeEach(() => {
    mockCheckPolicy.mockResolvedValue({ allow: true, reasons: [] });
  });

  it('happy path — records approval, increments collectedSigs, emits socket events', async () => {
    const db = buildMockDb({
      withdrawal: makeWithdrawal(),
      op: makeOp(),
      signingKey: makeSigningKey(),
      existingApproval: undefined,
    });
    const io = makeMockIo();

    const result = await approveWithdrawal(
      db as unknown as Parameters<typeof approveWithdrawal>[0],
      WITHDRAWAL_ID,
      STAFF_ID,
      VALID_INPUT,
      io as unknown as Parameters<typeof approveWithdrawal>[4],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.op).toBeDefined();
    expect(result.progress).toBe('1/2');
    expect(result.thresholdMet).toBe(false);
    expect(io._emit).toHaveBeenCalledWith(
      'withdrawal.approved',
      expect.objectContaining({ withdrawalId: WITHDRAWAL_ID })
    );
    expect(io._emit).toHaveBeenCalledWith(
      'multisig.progress',
      expect.objectContaining({ opId: OP_ID })
    );
  });

  it('threshold met — collectedSigs == requiredSigs → thresholdMet=true', async () => {
    const db = buildMockDb({
      withdrawal: makeWithdrawal(),
      op: makeOp({ collectedSigs: 1, requiredSigs: 2 }),
      signingKey: makeSigningKey(),
      existingApproval: undefined,
      updatedOp: makeOp({ collectedSigs: 2, requiredSigs: 2, status: 'ready' }),
    });
    const io = makeMockIo();

    const result = await approveWithdrawal(
      db as unknown as Parameters<typeof approveWithdrawal>[0],
      WITHDRAWAL_ID,
      STAFF_ID,
      VALID_INPUT,
      io as unknown as Parameters<typeof approveWithdrawal>[4],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.thresholdMet).toBe(true);
    expect(result.progress).toBe('2/2');
  });

  it('throws NotFoundError when withdrawal not found', async () => {
    const db = buildMockDb({ withdrawal: undefined, op: makeOp(), signingKey: makeSigningKey() });
    const io = makeMockIo();

    await expect(
      approveWithdrawal(
        db as unknown as Parameters<typeof approveWithdrawal>[0],
        WITHDRAWAL_ID,
        STAFF_ID,
        VALID_INPUT,
        io as unknown as Parameters<typeof approveWithdrawal>[4],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });

  it('throws ConflictError when withdrawal status is not pending/approved/time_locked', async () => {
    const db = buildMockDb({
      withdrawal: makeWithdrawal({ status: 'completed' }),
      op: makeOp(),
      signingKey: makeSigningKey(),
    });
    const io = makeMockIo();

    await expect(
      approveWithdrawal(
        db as unknown as Parameters<typeof approveWithdrawal>[0],
        WITHDRAWAL_ID,
        STAFF_ID,
        VALID_INPUT,
        io as unknown as Parameters<typeof approveWithdrawal>[4],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('throws ConflictError when staff already approved this op (duplicate)', async () => {
    const db = buildMockDb({
      withdrawal: makeWithdrawal(),
      op: makeOp(),
      signingKey: makeSigningKey(),
      existingApproval: { id: 'approval-uuid-001', opId: OP_ID, staffSigningKeyId: KEY_ID },
    });
    const io = makeMockIo();

    await expect(
      approveWithdrawal(
        db as unknown as Parameters<typeof approveWithdrawal>[0],
        WITHDRAWAL_ID,
        STAFF_ID,
        VALID_INPUT,
        io as unknown as Parameters<typeof approveWithdrawal>[4],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('throws NotFoundError when multisig op not found', async () => {
    const db = buildMockDb({
      withdrawal: makeWithdrawal(),
      op: undefined,
      signingKey: makeSigningKey(),
    });
    const io = makeMockIo();

    await expect(
      approveWithdrawal(
        db as unknown as Parameters<typeof approveWithdrawal>[0],
        WITHDRAWAL_ID,
        STAFF_ID,
        VALID_INPUT,
        io as unknown as Parameters<typeof approveWithdrawal>[4],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });
});
