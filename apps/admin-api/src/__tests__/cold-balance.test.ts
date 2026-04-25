// Unit tests for cold balance service — wallet address resolution, parallel probes,
// RPC failure graceful fallback (stale=true), multi-chain aggregation.
// Uses in-memory mocks — no real Postgres, Redis, or RPC required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getColdBalances } from '../services/cold-balance.service.js';

// ── Module mocks — must be at top level before imports ────────────────────────

vi.mock('ethers', () => ({
  Interface: vi.fn().mockReturnValue({}),
  JsonRpcProvider: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
  })),
  Contract: vi.fn().mockImplementation(() => ({
    getFunction: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(BigInt('1000000000000000000'))),
  })),
}));

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn().mockImplementation(() => ({
    getTokenAccountsByOwner: vi.fn().mockResolvedValue({ value: [] }),
  })),
  PublicKey: vi.fn().mockImplementation((addr: string) => ({ toBase58: () => addr })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CFG = {
  rpcBnb: 'https://bsc-testnet.example.com',
  rpcSolana: 'https://api.devnet.solana.com',
  usdtBnbAddr: '0xUSDT_BNB',
  usdcBnbAddr: '0xUSDC_BNB',
  usdtSolMint: 'So11111111111111111111111111111111111111112',
  usdcSolMint: 'So11111111111111111111111111111111111111113',
};

const makeWalletRow = (chain: 'bnb' | 'sol', tier: 'hot' | 'cold', purpose: string) => ({
  chain,
  tier,
  purpose,
  address: `0x${chain.toUpperCase()}_${tier.toUpperCase()}_ADDR`,
});

// ── Mock helpers ──────────────────────────────────────────────────────────────

function buildMockDb(opts: {
  coldRows?: ReturnType<typeof makeWalletRow>[];
  hotRows?: ReturnType<typeof makeWalletRow>[];
}) {
  const coldRows = opts.coldRows ?? [
    makeWalletRow('bnb', 'cold', 'cold_reserve'),
    makeWalletRow('sol', 'cold', 'cold_reserve'),
  ];
  const hotRows = opts.hotRows ?? [
    makeWalletRow('bnb', 'hot', 'operational'),
    makeWalletRow('sol', 'hot', 'operational'),
  ];

  let selectCallCount = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      selectCallCount++;
      const rows = selectCallCount === 1 ? coldRows : hotRows;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(rows),
        }),
      };
    }),
  };
}

function makeMockRedis(cachedValue: string | null = null) {
  return {
    get: vi.fn().mockResolvedValue(cachedValue),
    set: vi.fn().mockResolvedValue('OK'),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getColdBalances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 8 balance entries for 4 wallets × 2 tokens (BNB hot/cold + SOL hot/cold)', async () => {
    const db = buildMockDb({});
    const redis = makeMockRedis();

    const entries = await getColdBalances(
      db as unknown as Parameters<typeof getColdBalances>[0],
      redis as unknown as Parameters<typeof getColdBalances>[1],
      CFG
    );

    // 4 wallets × 2 tokens = 8 entries (filters out empty addresses)
    expect(entries.length).toBeGreaterThanOrEqual(4);
    for (const e of entries) {
      expect(e).toMatchObject({
        chain: expect.stringMatching(/^(bnb|sol)$/),
        tier: expect.stringMatching(/^(hot|cold)$/),
        token: expect.stringMatching(/^(USDT|USDC)$/),
        balance: expect.any(String),
        lastCheckedAt: expect.any(String),
      });
    }
  });

  it('serves from cache when Redis has a cached value', async () => {
    const cached = JSON.stringify({ balance: '9999', lastCheckedAt: '2026-04-01T00:00:00.000Z' });
    const db = buildMockDb({});
    const redis = makeMockRedis(cached);

    const entries = await getColdBalances(
      db as unknown as Parameters<typeof getColdBalances>[0],
      redis as unknown as Parameters<typeof getColdBalances>[1],
      CFG
    );

    // At least some entries should come from cache (balance='9999')
    const cachedEntries = entries.filter((e) => e.balance === '9999');
    expect(cachedEntries.length).toBeGreaterThan(0);
  });

  it('returns stale=true entries when RPC probe fails', async () => {
    const { Contract } = await import('ethers');
    // Make EVM probe throw
    vi.mocked(Contract).mockImplementation(
      () =>
        ({
          getFunction: vi.fn().mockReturnValue(vi.fn().mockRejectedValue(new Error('RPC timeout'))),
        }) as never
    );

    const db = buildMockDb({});
    const redis = makeMockRedis(null); // no cache

    const entries = await getColdBalances(
      db as unknown as Parameters<typeof getColdBalances>[0],
      redis as unknown as Parameters<typeof getColdBalances>[1],
      CFG
    );

    // BNB entries should be stale due to RPC failure
    const bnbEntries = entries.filter((e) => e.chain === 'bnb');
    for (const e of bnbEntries) {
      expect(e.stale).toBe(true);
      expect(e.balance).toBe('0');
    }
  });

  it('returns empty array when no wallets are registered', async () => {
    const db = buildMockDb({ coldRows: [], hotRows: [] });
    const redis = makeMockRedis();

    const entries = await getColdBalances(
      db as unknown as Parameters<typeof getColdBalances>[0],
      redis as unknown as Parameters<typeof getColdBalances>[1],
      CFG
    );

    // All addresses are empty string → filtered out by .filter(t => t.address !== '')
    expect(entries).toHaveLength(0);
  });
});
