// Unit tests for user-balance-query service
// Uses in-memory DB mocks — no real Postgres required.
import { describe, expect, it, vi } from 'vitest';
import { getUserBalance } from '../services/user-balance-query.service.js';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeSelectMock(rows: { currency: string; net: string }[]) {
  const mock = {
    from: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn().mockResolvedValue(rows),
  };
  mock.from.mockReturnValue(mock);
  mock.where.mockReturnValue(mock);
  return { select: vi.fn().mockReturnValue(mock) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getUserBalance', () => {
  it('returns zero balance when no ledger entries exist', async () => {
    const db = makeSelectMock([]) as unknown as Parameters<typeof getUserBalance>[0];
    const result = await getUserBalance(db, 'user-uuid-0001');
    expect(result).toEqual({ USDT: '0', USDC: '0' });
  });

  it('returns correct USDT balance from credit entry', async () => {
    const db = makeSelectMock([
      { currency: 'USDT', net: '500.000000000000000000' },
    ]) as unknown as Parameters<typeof getUserBalance>[0];
    const result = await getUserBalance(db, 'user-uuid-0001');
    expect(result.USDT).toBe('500.000000000000000000');
    expect(result.USDC).toBe('0');
  });

  it('returns correct signed sum with both credit and debit', async () => {
    // 1000 credited, 300 debited → net 700
    const db = makeSelectMock([
      { currency: 'USDC', net: '700.000000000000000000' },
    ]) as unknown as Parameters<typeof getUserBalance>[0];
    const result = await getUserBalance(db, 'user-uuid-0002');
    expect(result.USDC).toBe('700.000000000000000000');
  });

  it('handles mixed currencies and returns correct map', async () => {
    const db = makeSelectMock([
      { currency: 'USDT', net: '1234.500000000000000000' },
      { currency: 'USDC', net: '99.000000000000000000' },
    ]) as unknown as Parameters<typeof getUserBalance>[0];
    const result = await getUserBalance(db, 'user-uuid-0003');
    expect(result.USDT).toBe('1234.500000000000000000');
    expect(result.USDC).toBe('99.000000000000000000');
  });

  it('preserves high-precision decimal string (36,18 scale)', async () => {
    const preciseNet = '0.000000000000000001';
    const db = makeSelectMock([{ currency: 'USDT', net: preciseNet }]) as unknown as Parameters<
      typeof getUserBalance
    >[0];
    const result = await getUserBalance(db, 'user-uuid-precision');
    expect(result.USDT).toBe(preciseNet);
  });

  it('returns null-safe result when net is null', async () => {
    // Postgres SUM of no rows returns null
    const db = makeSelectMock([
      { currency: 'USDT', net: null as unknown as string },
    ]) as unknown as Parameters<typeof getUserBalance>[0];
    const result = await getUserBalance(db, 'user-uuid-null');
    // null net should default to '0'
    expect(result.USDT).toBe('0');
  });
});
