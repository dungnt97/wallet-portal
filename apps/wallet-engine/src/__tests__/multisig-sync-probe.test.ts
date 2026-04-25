// Unit tests for multisig-sync-probe service.
// Covers BNB Safe nonce probe, Solana PDA existence check, Redis cache hit/miss,
// stale detection, and error → status='error' fallback.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMultisigSyncStatus } from '../services/multisig-sync-probe.js';
import type { SyncProbeConfig } from '../services/multisig-sync-probe.js';

// ── Mock ethers (dynamic import inside probeBnbSafe) ─────────────────────────

const mockNonce = vi.fn();
vi.mock('ethers', () => ({
  Interface: vi.fn(() => ({})),
  Contract: vi.fn(() => ({
    getFunction: vi.fn().mockReturnValue(mockNonce),
  })),
}));

// ── Mock @solana/web3.js ───────────────────────────────────────────────────────

const mockGetAccountInfo = vi.fn();
vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(),
  PublicKey: vi.fn().mockImplementation((v: string) => ({ toString: () => v })),
}));

// ── Factories ─────────────────────────────────────────────────────────────────

function makeRedis(bnbCached: string | null = null, solCached: string | null = null) {
  const mock = {
    get: vi.fn().mockImplementation((key: string) => {
      if (key.includes('bnb')) return Promise.resolve(bnbCached);
      return Promise.resolve(solCached);
    }),
    set: vi.fn().mockResolvedValue('OK'),
  };
  return mock as unknown as import('ioredis').default & typeof mock;
}

function makeCfg(): SyncProbeConfig {
  return {
    bnbProvider: {} as never,
    solanaConnection: { getAccountInfo: mockGetAccountInfo } as never,
    safeAddress: '0xSafe1234',
    squadsPda: 'SquadsPDA1111',
  };
}

function cachedResult(status: string, nonce?: number) {
  return JSON.stringify({
    status,
    lastSyncAt: new Date().toISOString(),
    ...(nonce !== undefined ? { nonce } : {}),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getMultisigSyncStatus — cache hit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached BNB synced result without probing RPC', async () => {
    const redis = makeRedis(cachedResult('synced', 5), cachedResult('synced'));
    const result = await getMultisigSyncStatus(redis, makeCfg());

    expect(result.bnb.status).toBe('synced');
    expect(result.bnb.nonce).toBe(5);
    expect(mockNonce).not.toHaveBeenCalled();
    expect(mockGetAccountInfo).not.toHaveBeenCalled();
  });

  it('marks cache result as stale when lastSyncAt > 5 min ago', async () => {
    const oldDate = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const staleData = JSON.stringify({ status: 'synced', lastSyncAt: oldDate, nonce: 3 });
    const redis = makeRedis(staleData, staleData);

    const result = await getMultisigSyncStatus(redis, makeCfg());

    expect(result.bnb.status).toBe('stale');
    expect(result.sol.status).toBe('stale');
  });
});

describe('getMultisigSyncStatus — BNB probe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('cache miss BNB: probes RPC and returns synced with nonce', async () => {
    const redis = makeRedis(null, cachedResult('synced'));
    mockNonce.mockResolvedValue(7n);

    const result = await getMultisigSyncStatus(redis, makeCfg());

    expect(result.bnb.status).toBe('synced');
    expect(result.bnb.nonce).toBe(7);
  });

  it('BNB RPC throws: returns status=error', async () => {
    const redis = makeRedis(null, cachedResult('synced'));
    mockNonce.mockRejectedValue(new Error('contract not found'));

    const result = await getMultisigSyncStatus(redis, makeCfg());

    expect(result.bnb.status).toBe('error');
    expect(result.bnb.nonce).toBeUndefined();
  });

  it('fresh BNB probe is cached in Redis', async () => {
    const redis = makeRedis(null, cachedResult('synced'));
    mockNonce.mockResolvedValue(2n);

    await getMultisigSyncStatus(redis, makeCfg());

    expect(redis.set).toHaveBeenCalledWith(
      'multisig:sync:bnb',
      expect.stringContaining('"status":"synced"'),
      'EX',
      60
    );
  });
});

describe('getMultisigSyncStatus — Solana probe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('cache miss SOL: probes PDA and returns synced when account exists', async () => {
    const redis = makeRedis(cachedResult('synced', 1), null);
    mockGetAccountInfo.mockResolvedValue({ data: Buffer.alloc(100), lamports: 1000 });

    const result = await getMultisigSyncStatus(redis, makeCfg());

    expect(result.sol.status).toBe('synced');
  });

  it('PDA account info is null: returns status=error', async () => {
    const redis = makeRedis(cachedResult('synced', 1), null);
    mockGetAccountInfo.mockResolvedValue(null);

    const result = await getMultisigSyncStatus(redis, makeCfg());

    expect(result.sol.status).toBe('error');
  });

  it('Solana RPC throws: returns status=error', async () => {
    const redis = makeRedis(cachedResult('synced', 1), null);
    mockGetAccountInfo.mockRejectedValue(new Error('RPC failure'));

    const result = await getMultisigSyncStatus(redis, makeCfg());

    expect(result.sol.status).toBe('error');
  });
});

describe('getMultisigSyncStatus — bustCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('bustCache=true: ignores cached values and re-probes both chains', async () => {
    const redis = makeRedis(cachedResult('synced', 9), cachedResult('synced'));
    mockNonce.mockResolvedValue(10n);
    mockGetAccountInfo.mockResolvedValue({ data: Buffer.alloc(10), lamports: 500 });

    const result = await getMultisigSyncStatus(redis, makeCfg(), true);

    // nonce should come from fresh probe (10), not cache (9)
    expect(result.bnb.nonce).toBe(10);
    expect(mockNonce).toHaveBeenCalled();
    expect(mockGetAccountInfo).toHaveBeenCalled();
  });
});
