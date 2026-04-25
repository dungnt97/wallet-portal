// Unit tests for signer-ceremony-validate service — loadStaff, requireActiveKeysForBothChains,
// getActiveTreasurerCount, insertCeremonyMultisigOp.
// Uses in-memory mocks — no real Postgres required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  getActiveTreasurerCount,
  insertCeremonyMultisigOp,
  loadStaff,
  requireActiveKeysForBothChains,
} from '../services/signer-ceremony-validate.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';

const makeStaff = (overrides: Record<string, unknown> = {}) => ({
  id: STAFF_ID,
  name: 'Alice',
  email: 'alice@treasury.io',
  role: 'treasurer',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeBnbKey = (overrides: Record<string, unknown> = {}) => ({
  id: 'key-bnb-001',
  staffId: STAFF_ID,
  chain: 'bnb',
  address: '0xBNB',
  revokedAt: null,
  ...overrides,
});

const makeSolKey = (overrides: Record<string, unknown> = {}) => ({
  id: 'key-sol-001',
  staffId: STAFF_ID,
  chain: 'sol',
  address: 'SolAddr',
  revokedAt: null,
  ...overrides,
});

// ── Mock builder ──────────────────────────────────────────────────────────────

function buildSelectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    returning: vi.fn().mockResolvedValue(rows),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  };
  return chain;
}

function makeInsertChain(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const values = vi.fn().mockReturnValue({ returning });
  return vi.fn().mockReturnValue({ values });
}

function buildMockDb(
  opts: {
    staff?: unknown;
    keys?: unknown[];
    treasurers?: unknown[];
    opRow?: unknown;
  } = {}
) {
  return {
    query: {
      staffMembers: {
        findFirst: vi.fn().mockResolvedValue(opts.staff),
        findMany: vi
          .fn()
          .mockResolvedValue(opts.treasurers ?? [makeStaff(), makeStaff({ id: 'staff-2' })]),
      },
      staffSigningKeys: {
        findMany: vi.fn().mockResolvedValue(opts.keys ?? [makeBnbKey(), makeSolKey()]),
      },
    },
    insert: makeInsertChain([opts.opRow ?? { id: 'op-uuid-001', chain: 'bnb' }]),
    select: vi.fn().mockReturnValue(buildSelectChain([])),
  };
}

// ── Tests — loadStaff ─────────────────────────────────────────────────────────

describe('loadStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns staff when found', async () => {
    const db = buildMockDb({ staff: makeStaff() });
    const result = await loadStaff(db as unknown as Parameters<typeof loadStaff>[0], STAFF_ID);
    expect(result).toMatchObject({ id: STAFF_ID });
  });

  it('throws NotFoundError when staff missing', async () => {
    const db = buildMockDb({ staff: undefined });
    await expect(
      loadStaff(db as unknown as Parameters<typeof loadStaff>[0], STAFF_ID)
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });
});

// ── Tests — requireActiveKeysForBothChains ────────────────────────────────────

describe('requireActiveKeysForBothChains', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns both keys when present', async () => {
    const db = buildMockDb({ keys: [makeBnbKey(), makeSolKey()] });
    const result = await requireActiveKeysForBothChains(
      db as unknown as Parameters<typeof requireActiveKeysForBothChains>[0],
      STAFF_ID
    );
    expect(result.bnbKey.chain).toBe('bnb');
    expect(result.solanaKey.chain).toBe('sol');
  });

  it('throws ValidationError when BNB key missing', async () => {
    const db = buildMockDb({ keys: [makeSolKey()] });
    await expect(
      requireActiveKeysForBothChains(
        db as unknown as Parameters<typeof requireActiveKeysForBothChains>[0],
        STAFF_ID
      )
    ).rejects.toMatchObject({ name: 'ValidationError', statusCode: 422 });
  });

  it('throws ValidationError when Solana key missing', async () => {
    const db = buildMockDb({ keys: [makeBnbKey()] });
    await expect(
      requireActiveKeysForBothChains(
        db as unknown as Parameters<typeof requireActiveKeysForBothChains>[0],
        STAFF_ID
      )
    ).rejects.toMatchObject({ name: 'ValidationError', statusCode: 422 });
  });
});

// ── Tests — getActiveTreasurerCount ──────────────────────────────────────────

describe('getActiveTreasurerCount', () => {
  it('returns count of active treasurers', async () => {
    const db = buildMockDb({ treasurers: [makeStaff(), makeStaff({ id: 'staff-2' })] });
    const count = await getActiveTreasurerCount(
      db as unknown as Parameters<typeof getActiveTreasurerCount>[0]
    );
    expect(count).toBe(2);
  });

  it('returns 0 when no active treasurers', async () => {
    const db = buildMockDb({ treasurers: [] });
    const count = await getActiveTreasurerCount(
      db as unknown as Parameters<typeof getActiveTreasurerCount>[0]
    );
    expect(count).toBe(0);
  });
});

// ── Tests — error class shapes ────────────────────────────────────────────────

describe('error classes', () => {
  it('NotFoundError has statusCode=404, code=NOT_FOUND', () => {
    const err = new NotFoundError('missing');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err instanceof Error).toBe(true);
  });

  it('ValidationError has statusCode=422, code=VALIDATION_ERROR', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('ConflictError has statusCode=409, code=CONFLICT', () => {
    const err = new ConflictError('dup');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});

// ── Tests — insertCeremonyMultisigOp ─────────────────────────────────────────

describe('insertCeremonyMultisigOp', () => {
  beforeEach(() => {
    process.env.SAFE_ADDRESS = '0xSafeTest0000000000000000000000000000001';
    process.env.SQUADS_MULTISIG_ADDRESS = 'SquadsTestPDA11111111111111111111111111111';
  });

  it('inserts op row and returns id', async () => {
    const db = buildMockDb({ opRow: { id: 'op-uuid-001' } });
    const id = await insertCeremonyMultisigOp(
      db as unknown as Parameters<typeof insertCeremonyMultisigOp>[0],
      { ceremonyId: 'cer-001', chain: 'bnb', operationType: 'signer_add' }
    );
    expect(id).toBe('op-uuid-001');
  });
});
