// Unit tests for user-addresses-query service — BNB+SOL addresses with Redis balance cache.
// Uses in-memory mocks — no real Postgres or Redis required.
import { describe, expect, it, vi } from 'vitest';
import { getUserAddresses } from '../services/user-addresses-query.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-0001';

const makeAddressRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'addr-uuid-0001',
  userId: USER_ID,
  chain: 'bnb' as const,
  address: '0xABC123',
  derivationPath: "m/44'/60'/0'/0/0",
  derivationIndex: 0,
  tier: 'hot' as const,
  createdAt: new Date(),
  ...overrides,
});

// ── Mock builders ─────────────────────────────────────────────────────────────

/** Drizzle select chain: .select().from().where().orderBy() → Promise<rows> */
function buildSelectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(rows),
  };
  return chain;
}

function buildMockDb(addressRows: unknown[]) {
  return {
    select: vi.fn().mockReturnValue(buildSelectChain(addressRows)),
  };
}

function buildMockRedis(mgetResult: (string | null)[]) {
  return {
    mget: vi.fn().mockResolvedValue(mgetResult),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getUserAddresses service', () => {
  it('happy path — returns BNB + SOL addresses with cached balances', async () => {
    const bnbRow = makeAddressRow({ chain: 'bnb', address: '0xBNB' });
    const solRow = makeAddressRow({ id: 'addr-uuid-0002', chain: 'sol', address: 'SolAddr1' });
    const db = buildMockDb([bnbRow, solRow]);
    const redis = buildMockRedis(['100.50', '200.00']); // USDT, USDC

    const result = await getUserAddresses(
      db as unknown as Parameters<typeof getUserAddresses>[0],
      redis as unknown as Parameters<typeof getUserAddresses>[1],
      USER_ID
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      chain: 'bnb',
      address: '0xBNB',
      cached: true,
      balance: { USDT: '100.50', USDC: '200.00' },
    });
  });

  it('returns cached=false and balance=null when Redis has no keys', async () => {
    const db = buildMockDb([makeAddressRow()]);
    const redis = buildMockRedis([null, null]);

    const result = await getUserAddresses(
      db as unknown as Parameters<typeof getUserAddresses>[0],
      redis as unknown as Parameters<typeof getUserAddresses>[1],
      USER_ID
    );

    expect(result[0]).toMatchObject({ cached: false, balance: null });
  });

  it('returns empty array when user has no derived addresses yet', async () => {
    const db = buildMockDb([]);
    const redis = buildMockRedis([]);

    const result = await getUserAddresses(
      db as unknown as Parameters<typeof getUserAddresses>[0],
      redis as unknown as Parameters<typeof getUserAddresses>[1],
      USER_ID
    );

    expect(result).toHaveLength(0);
  });

  it('treats Redis error as cache miss — does not throw', async () => {
    const db = buildMockDb([makeAddressRow()]);
    const redis = { mget: vi.fn().mockRejectedValue(new Error('Redis unavailable')) };

    const result = await getUserAddresses(
      db as unknown as Parameters<typeof getUserAddresses>[0],
      redis as unknown as Parameters<typeof getUserAddresses>[1],
      USER_ID
    );

    expect(result[0]).toMatchObject({ cached: false, balance: null });
  });

  it('createdAt is serialised as ISO string', async () => {
    const now = new Date('2024-01-15T10:30:00.000Z');
    const db = buildMockDb([makeAddressRow({ createdAt: now })]);
    const redis = buildMockRedis([null, null]);

    const result = await getUserAddresses(
      db as unknown as Parameters<typeof getUserAddresses>[0],
      redis as unknown as Parameters<typeof getUserAddresses>[1],
      USER_ID
    );

    expect(result[0]?.createdAt).toBe('2024-01-15T10:30:00.000Z');
  });

  it('cached=true when only USDT key exists (USDC null)', async () => {
    const db = buildMockDb([makeAddressRow()]);
    const redis = buildMockRedis(['50.00', null]);

    const result = await getUserAddresses(
      db as unknown as Parameters<typeof getUserAddresses>[0],
      redis as unknown as Parameters<typeof getUserAddresses>[1],
      USER_ID
    );

    expect(result[0]?.cached).toBe(true);
    expect(result[0]?.balance).toMatchObject({ USDT: '50.00', USDC: null });
  });
});
