import { describe, expect, it, vi } from 'vitest';
// Supplemental coverage for deposit-manual-credit.service.ts lines 39-84:
// Error class constructors, function body validation, notifyStaff failure silencing.
// Isolated from vi.clearAllMocks() to avoid v8 coverage gaps from module caching.

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/ledger.service.js', () => ({
  recordCredit: vi.fn().mockResolvedValue(undefined),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-mc-supp-001';
const USER_ID = 'user-mc-supp-001';
const DEPOSIT_ID = 'dep-mc-supp-001';

function buildDb(opts: { user?: unknown; shouldFail?: boolean }) {
  const txMock = {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(opts.shouldFail ? [] : [{ id: DEPOSIT_ID }]),
      }),
    }),
  };

  return {
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue(opts.user !== undefined ? opts.user : { id: USER_ID }),
      },
    },
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
    _txMock: txMock,
  };
}

const VALID_PARAMS = {
  userId: USER_ID,
  chain: 'bnb' as const,
  token: 'USDT' as const,
  amount: '250.00',
  reason: 'Correcting missed on-chain credit for Q1 audit',
  staffId: STAFF_ID,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('deposit-manual-credit.service — supplemental coverage', () => {
  it('ValidationError constructor sets name and statusCode', async () => {
    const { ValidationError } = await import('../services/deposit-manual-credit.service.js');
    const err = new ValidationError('bad input');
    expect(err.name).toBe('ValidationError');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('bad input');
  });

  it('NotFoundError constructor sets name and statusCode', async () => {
    const { NotFoundError } = await import('../services/deposit-manual-credit.service.js');
    const err = new NotFoundError('not found');
    expect(err.name).toBe('NotFoundError');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('throws ValidationError for NaN amount', async () => {
    const { manualCredit } = await import('../services/deposit-manual-credit.service.js');
    const db = buildDb({});
    await expect(
      manualCredit(db as never, {} as never, {} as never, {} as never, {
        ...VALID_PARAMS,
        amount: 'not-a-number',
      })
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('throws ValidationError for amount = Infinity', async () => {
    const { manualCredit } = await import('../services/deposit-manual-credit.service.js');
    const db = buildDb({});
    await expect(
      manualCredit(db as never, {} as never, {} as never, {} as never, {
        ...VALID_PARAMS,
        amount: 'Infinity',
      })
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('throws NotFoundError when user is not in db', async () => {
    const { manualCredit } = await import('../services/deposit-manual-credit.service.js');
    const db = buildDb({ user: null });
    await expect(
      manualCredit(db as never, {} as never, {} as never, {} as never, VALID_PARAMS)
    ).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('executes transaction and calls insert + recordCredit + emitAudit', async () => {
    const { manualCredit } = await import('../services/deposit-manual-credit.service.js');
    const { emitAudit } = await import('../services/audit.service.js');
    const { recordCredit } = await import('../services/ledger.service.js');

    const db = buildDb({});
    const mockIo = { of: vi.fn().mockReturnValue({ emit: vi.fn() }) };
    const mockQueue = { add: vi.fn() };
    // notifyStaff is NOT mocked here — it will be imported fresh; mock it inline
    const notifyMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../services/notify-staff.service.js', () => ({
      notifyStaff: notifyMock,
    }));

    const result = await manualCredit(
      db as never,
      mockIo as never,
      mockQueue as never,
      mockQueue as never,
      VALID_PARAMS
    );

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db._txMock.insert).toHaveBeenCalledTimes(1);
    expect(recordCredit).toHaveBeenCalledTimes(1);
    expect(emitAudit).toHaveBeenCalledTimes(1);
    expect(result.depositId).toBe(DEPOSIT_ID);
    expect(result.chain).toBe('bnb');
    expect(result.token).toBe('USDT');
  });

  it('silences notifyStaff errors (non-fatal notification failure)', async () => {
    const { manualCredit } = await import('../services/deposit-manual-credit.service.js');
    const db = buildDb({});
    const mockIo = { of: vi.fn().mockReturnValue({ emit: vi.fn() }) };
    const mockQueue = { add: vi.fn() };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // notifyStaff is already mocked at module level — make it reject to test error silencing
    vi.doMock('../services/notify-staff.service.js', () => ({
      notifyStaff: vi.fn().mockRejectedValue(new Error('email queue down')),
    }));

    // Should NOT throw even when notify fails
    const result = await manualCredit(
      db as never,
      mockIo as never,
      mockQueue as never,
      mockQueue as never,
      VALID_PARAMS
    );
    expect(result.depositId).toBe(DEPOSIT_ID);

    errorSpy.mockRestore();
  });
});
