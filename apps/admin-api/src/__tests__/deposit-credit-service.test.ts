// Unit tests for deposit credit service — happy path, idempotency (409), not-found (404)
// Uses in-memory mocks for DB — no real Postgres required.
// Note: vi.resetModules() is avoided here because it creates separate module instances
// that break instanceof checks. Error shapes are validated by name/statusCode instead.
import { describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError, creditDeposit } from '../services/deposit-credit.service.js';

// ── Mock helpers ──────────────────────────────────────────────────────────────

const makeDeposit = (overrides: Record<string, unknown> = {}) => ({
  id: 'dep-uuid-0001',
  userId: 'user-uuid-0001',
  status: 'pending',
  txHash: 'fake_hash_001',
  amount: '1000',
  token: 'USDT',
  chain: 'bnb',
  confirmedBlocks: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/** Build an insert mock that chains .values().returning().onConflictDoUpdate() correctly */
function buildInsertMock(returnVal: unknown = [{ id: 'tx-uuid-0001' }]) {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(returnVal);
  const returning = vi.fn().mockReturnValue({ onConflictDoUpdate });
  // Second-level insert mock for ledger rows (no onConflictDoUpdate, just values())
  const values = vi
    .fn()
    .mockReturnValue({ returning, onConflictDoUpdate: vi.fn().mockResolvedValue([]) });
  return { insert: vi.fn().mockReturnValue({ values }) };
}

function buildMockDb(opts: {
  findFirst?: ReturnType<typeof makeDeposit> | undefined;
  updateStatus?: string;
  updateRowCount?: number;
}) {
  const updateStatus = opts.updateStatus ?? 'credited';
  const updateRowCount = opts.updateRowCount ?? 1;
  const updateRows = updateRowCount === 0 ? [] : [{ status: updateStatus }];

  /**
   * Drizzle builder chain for INSERT:
   *   .insert(table)
   *   .values({...})                   → builder
   *   .returning({...})                → builder  ← must have .onConflictDoUpdate()
   *   .onConflictDoUpdate({...})       → Promise<rows>
   *
   * For ledger/audit inserts (no onConflictDoUpdate):
   *   .insert(table).values({...})     → thenable (Promise-like)
   */
  const makeInsertBuilder = (returnRows: unknown[] = [{ id: 'tx-uuid-0001' }]) => {
    // Builder that is also thenable (for plain .insert().values() awaits)
    const thenableValues = {
      // biome-ignore lint/suspicious/noThenProperty: drizzle ORM mock requires .then for await chaining
      then: (resolve: (v: unknown) => void) => resolve(returnRows),
      returning: vi.fn().mockReturnValue({
        // returning() returns a builder with onConflictDoUpdate
        // biome-ignore lint/suspicious/noThenProperty: drizzle ORM mock requires .then for await chaining
        then: (resolve: (v: unknown) => void) => resolve(returnRows),
        onConflictDoUpdate: vi.fn().mockResolvedValue(returnRows),
      }),
    };
    return {
      values: vi.fn().mockReturnValue(thenableValues),
    };
  };

  const txMock = {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(updateRows),
        }),
      }),
    }),
    insert: vi.fn().mockImplementation(() => makeInsertBuilder()),
  };

  return {
    query: {
      deposits: {
        findFirst: vi.fn().mockResolvedValue(opts.findFirst),
      },
    },
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('creditDeposit service', () => {
  it('throws NotFoundError when deposit does not exist', async () => {
    const db = buildMockDb({ findFirst: undefined });
    await expect(
      creditDeposit(db as unknown as Parameters<typeof creditDeposit>[0], 'non-existent-uuid')
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404, code: 'NOT_FOUND' });
  });

  it('throws ConflictError when deposit is already credited', async () => {
    const db = buildMockDb({ findFirst: makeDeposit({ status: 'credited' }) });
    await expect(
      creditDeposit(db as unknown as Parameters<typeof creditDeposit>[0], 'dep-uuid-0001')
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409, code: 'CONFLICT' });
  });

  it('throws ConflictError when deposit is in failed state', async () => {
    const db = buildMockDb({ findFirst: makeDeposit({ status: 'failed' }) });
    await expect(
      creditDeposit(db as unknown as Parameters<typeof creditDeposit>[0], 'dep-uuid-0001')
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('throws ConflictError when update returns wrong status (race condition)', async () => {
    const db = buildMockDb({
      findFirst: makeDeposit({ status: 'pending' }),
      updateStatus: 'failed', // concurrent update changed the status
    });
    await expect(
      creditDeposit(db as unknown as Parameters<typeof creditDeposit>[0], 'dep-uuid-0001')
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('throws ConflictError when update returns no rows (concurrent deletion)', async () => {
    const db = buildMockDb({
      findFirst: makeDeposit({ status: 'pending' }),
      updateRowCount: 0,
    });
    await expect(
      creditDeposit(db as unknown as Parameters<typeof creditDeposit>[0], 'dep-uuid-0001')
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('returns CreditDepositResult with correct fields on happy path', async () => {
    const deposit = makeDeposit({ status: 'pending', txHash: 'hash_abc' });
    const db = buildMockDb({ findFirst: deposit });

    const result = await creditDeposit(
      db as unknown as Parameters<typeof creditDeposit>[0],
      deposit.id
    );

    expect(result).toMatchObject({
      id: deposit.id,
      userId: deposit.userId,
      status: 'credited',
      txHash: 'hash_abc',
      amount: '1000',
      token: 'USDT',
      chain: 'bnb',
    });
  });

  it('uses synthetic txHash when deposit.txHash is null', async () => {
    const deposit = makeDeposit({ status: 'pending', txHash: null });
    const db = buildMockDb({ findFirst: deposit });

    const result = await creditDeposit(
      db as unknown as Parameters<typeof creditDeposit>[0],
      deposit.id
    );

    expect(result.txHash).toMatch(/^sys_/);
  });

  it('calls db.transaction exactly once on happy path', async () => {
    const deposit = makeDeposit({ status: 'pending' });
    const db = buildMockDb({ findFirst: deposit });

    await creditDeposit(db as unknown as Parameters<typeof creditDeposit>[0], deposit.id);

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});

// ── Error shape tests ─────────────────────────────────────────────────────────

describe('ConflictError', () => {
  it('has statusCode 409, code CONFLICT, and name ConflictError', () => {
    const err = new ConflictError('test message');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.name).toBe('ConflictError');
    expect(err.message).toBe('test message');
    expect(err instanceof Error).toBe(true);
  });
});

describe('NotFoundError', () => {
  it('has statusCode 404, code NOT_FOUND, and name NotFoundError', () => {
    const err = new NotFoundError('not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
    expect(err.message).toBe('not found');
    expect(err instanceof Error).toBe(true);
  });
});
