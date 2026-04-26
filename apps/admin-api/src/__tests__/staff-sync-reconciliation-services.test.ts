import { beforeEach, describe, expect, it, vi } from 'vitest';
// Tests for:
//   staff-sync-google.service.ts   — syncGoogleWorkspace stub
//   reconciliation-address-enumerator.service.ts — enumerateManagedAddresses
//   reconciliation-ledger-expected.service.ts    — computeLedgerExpected

// ── staff-sync-google ─────────────────────────────────────────────────────────

describe('syncGoogleWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/performance/noDelete: test env cleanup
    delete process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
    // biome-ignore lint/performance/noDelete: test env cleanup
    delete process.env.GOOGLE_WORKSPACE_CREDS_JSON;
  });

  it('throws StubError when no env vars set', async () => {
    const { syncGoogleWorkspace, StubError } = await import(
      '../services/staff-sync-google.service.js'
    );
    await expect(syncGoogleWorkspace({} as never, 'staff-001')).rejects.toBeInstanceOf(StubError);
  });

  it('thrown StubError has statusCode=501 and code=NOT_IMPLEMENTED', async () => {
    const { syncGoogleWorkspace, StubError } = await import(
      '../services/staff-sync-google.service.js'
    );
    const err = await syncGoogleWorkspace({} as never, 'staff-001').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StubError);
    expect((err as InstanceType<typeof StubError>).statusCode).toBe(501);
    expect((err as InstanceType<typeof StubError>).code).toBe('NOT_IMPLEMENTED');
  });

  it('throws StubError even when env vars are set (SDK not installed)', async () => {
    process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL = 'admin@example.com';
    process.env.GOOGLE_WORKSPACE_CREDS_JSON = '{"type":"service_account"}';
    const { syncGoogleWorkspace, StubError } = await import(
      '../services/staff-sync-google.service.js'
    );
    await expect(syncGoogleWorkspace({} as never, 'staff-001')).rejects.toBeInstanceOf(StubError);
  });

  it('error message mentions docs/runbooks when no creds', async () => {
    const { syncGoogleWorkspace } = await import('../services/staff-sync-google.service.js');
    const err = await syncGoogleWorkspace({} as never, 'staff-001').catch((e: unknown) => e);
    expect((err as Error).message).toContain('docs/runbooks/staff-directory-sync.md');
  });

  it('error message mentions googleapis SDK when creds present', async () => {
    process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL = 'admin@example.com';
    process.env.GOOGLE_WORKSPACE_CREDS_JSON = '{"type":"service_account"}';
    const { syncGoogleWorkspace } = await import('../services/staff-sync-google.service.js');
    const err = await syncGoogleWorkspace({} as never, 'staff-001').catch((e: unknown) => e);
    expect((err as Error).message).toContain('googleapis');
  });
});

// ── reconciliation-address-enumerator ─────────────────────────────────────────

function makeSelectChain(rows: { chain: 'bnb' | 'sol'; address: string }[]) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

describe('enumerateManagedAddresses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns hot wallet addresses for scope=hot (USDT+USDC per wallet)', async () => {
    let callN = 0;
    const db = {
      select: vi.fn(() => {
        callN++;
        // Call 1 = hot wallets
        return {
          from: vi.fn().mockReturnValue({
            where: vi
              .fn()
              .mockResolvedValue(callN === 1 ? [{ chain: 'bnb' as const, address: '0xHot' }] : []),
          }),
        };
      }),
    } as never;

    const { enumerateManagedAddresses } = await import(
      '../services/reconciliation-address-enumerator.service.js'
    );
    const results = await enumerateManagedAddresses(db, 'hot', null, new Date());
    expect(results).toHaveLength(2); // USDT + USDC for 1 hot wallet
    expect(results[0].addressScope).toBe('hot');
    expect(results[0].accountLabel).toBe('hot_safe');
    const tokens = results.map((r) => r.token).sort();
    expect(tokens).toEqual(['USDC', 'USDT']);
  });

  it('returns cold wallet addresses for scope=cold', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ chain: 'sol' as const, address: 'SolCold' }]),
        }),
      }),
    } as never;

    const { enumerateManagedAddresses } = await import(
      '../services/reconciliation-address-enumerator.service.js'
    );
    const results = await enumerateManagedAddresses(db, 'cold', null, new Date());
    expect(results).toHaveLength(2);
    expect(results[0].addressScope).toBe('cold');
    expect(results[0].accountLabel).toBe('cold_reserve');
  });

  it('returns user addresses for scope=users with correct accountLabel', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([
              { userId: 'user-001', chain: 'bnb' as const, address: '0xUserAddr' },
            ]),
        }),
      }),
    } as never;

    const { enumerateManagedAddresses } = await import(
      '../services/reconciliation-address-enumerator.service.js'
    );
    const results = await enumerateManagedAddresses(db, 'users', null, new Date());
    expect(results).toHaveLength(2); // USDT + USDC
    expect(results[0].addressScope).toBe('user');
    expect(results[0].accountLabel).toBe('user:user-001');
  });

  it('returns all three scopes for scope=all', async () => {
    // 3 db.select calls: hot, cold, users
    let callN = 0;
    const fixtures: Array<Array<{ chain: 'bnb' | 'sol'; address: string; userId?: string }>> = [
      [{ chain: 'bnb', address: '0xHot' }],
      [{ chain: 'bnb', address: '0xCold' }],
      [{ userId: 'user-001', chain: 'sol', address: 'SolUser' }],
    ];
    const db = {
      select: vi.fn(() => {
        const rows = fixtures[callN++] ?? [];
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(rows),
          }),
        };
      }),
    } as never;

    const { enumerateManagedAddresses } = await import(
      '../services/reconciliation-address-enumerator.service.js'
    );
    const results = await enumerateManagedAddresses(db, 'all', null, new Date());
    // 1 hot × 2 tokens + 1 cold × 2 tokens + 1 user × 2 tokens = 6
    expect(results).toHaveLength(6);
    const scopes = [...new Set(results.map((r) => r.addressScope))].sort();
    expect(scopes).toEqual(['cold', 'hot', 'user']);
  });

  it('applies chainFilter when provided', async () => {
    const whereSpy = vi.fn().mockResolvedValue([{ chain: 'bnb' as const, address: '0xHot' }]);
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: whereSpy }),
      }),
    } as never;

    const { enumerateManagedAddresses } = await import(
      '../services/reconciliation-address-enumerator.service.js'
    );
    await enumerateManagedAddresses(db, 'hot', 'bnb', new Date());
    expect(whereSpy).toHaveBeenCalled();
  });

  it('returns empty when db returns no rows', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never;

    const { enumerateManagedAddresses } = await import(
      '../services/reconciliation-address-enumerator.service.js'
    );
    const results = await enumerateManagedAddresses(db, 'all', null, new Date());
    expect(results).toHaveLength(0);
  });
});

// ── reconciliation-ledger-expected ────────────────────────────────────────────

describe('computeLedgerExpected', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty Map when no account labels provided', async () => {
    const db = { select: vi.fn() } as never;
    const { computeLedgerExpected } = await import(
      '../services/reconciliation-ledger-expected.service.js'
    );
    const result = await computeLedgerExpected(db, [], ['USDT', 'USDC']);
    expect(result.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns Map keyed by accountLabel:token with bigint values', async () => {
    const rows = [
      { account: 'hot_safe', currency: 'USDT', netMinor: '1000000000000000000' },
      { account: 'hot_safe', currency: 'USDC', netMinor: '500000' },
      { account: 'user:user-001', currency: 'USDT', netMinor: '200000000000000000' },
    ];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    } as never;

    const { computeLedgerExpected } = await import(
      '../services/reconciliation-ledger-expected.service.js'
    );
    const result = await computeLedgerExpected(db, ['hot_safe', 'user:user-001'], ['USDT', 'USDC']);
    expect(result.size).toBe(3);
    expect(result.get('hot_safe:USDT')).toBe(1000000000000000000n);
    expect(result.get('hot_safe:USDC')).toBe(500000n);
    expect(result.get('user:user-001:USDT')).toBe(200000000000000000n);
  });

  it('strips decimal portion from netMinor (postgres numeric format)', async () => {
    const rows = [
      { account: 'cold_reserve', currency: 'USDT', netMinor: '999999.000000000000000000' },
    ];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    } as never;

    const { computeLedgerExpected } = await import(
      '../services/reconciliation-ledger-expected.service.js'
    );
    const result = await computeLedgerExpected(db, ['cold_reserve'], ['USDT']);
    expect(result.get('cold_reserve:USDT')).toBe(999999n);
  });

  it('returns 0n for null/empty netMinor', async () => {
    const rows = [{ account: 'hot_safe', currency: 'USDC', netMinor: null }];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    } as never;

    const { computeLedgerExpected } = await import(
      '../services/reconciliation-ledger-expected.service.js'
    );
    const result = await computeLedgerExpected(db, ['hot_safe'], ['USDC']);
    expect(result.get('hot_safe:USDC')).toBe(0n);
  });

  it('returns empty Map when db returns no rows for given labels', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as never;

    const { computeLedgerExpected } = await import(
      '../services/reconciliation-ledger-expected.service.js'
    );
    const result = await computeLedgerExpected(db, ['unknown:account'], ['USDT']);
    expect(result.size).toBe(0);
  });

  it('handles negative net balance (debit > credit)', async () => {
    const rows = [{ account: 'hot_safe', currency: 'USDT', netMinor: '-50000' }];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    } as never;

    const { computeLedgerExpected } = await import(
      '../services/reconciliation-ledger-expected.service.js'
    );
    const result = await computeLedgerExpected(db, ['hot_safe'], ['USDT']);
    expect(result.get('hot_safe:USDT')).toBe(-50000n);
  });
});
