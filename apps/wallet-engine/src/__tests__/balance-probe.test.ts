// Unit tests for balance-probe service.
// Covers EVM ERC-20, Solana SPL, Redis cache hit, and error fallback paths.
// No real RPC or Redis connections.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeBatch, probeEvmBalance, probeSolanaBalance } from '../services/balance-probe.js';
import type { ProbeBatchConfig, ProbeRequest } from '../services/balance-probe.js';

// ── Mock ethers ────────────────────────────────────────────────────────────────

const mockBalanceOf = vi.fn();
const mockProviderDestroy = vi.fn();

vi.mock('ethers', () => ({
  Interface: vi.fn(() => ({})),
  JsonRpcProvider: vi.fn(() => ({
    destroy: mockProviderDestroy,
  })),
  Contract: vi.fn(() => ({
    getFunction: vi.fn().mockReturnValue(mockBalanceOf),
  })),
}));

// ── Mock @solana/web3.js ───────────────────────────────────────────────────────

const mockGetTokenAccountsByOwner = vi.fn();

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(() => ({ getTokenAccountsByOwner: mockGetTokenAccountsByOwner })),
  PublicKey: vi.fn().mockImplementation((v: string) => ({
    toString: () => v,
    toBuffer: () => Buffer.alloc(32),
  })),
}));

// ── Factories ─────────────────────────────────────────────────────────────────

function makeRedis(cached: string | null = null) {
  const mock = {
    get: vi.fn().mockResolvedValue(cached),
    set: vi.fn().mockResolvedValue('OK'),
  };
  return mock as unknown as import('ioredis').default & typeof mock;
}

/** Build a minimal SPL token account data buffer with amount at offset 64 */
function makeSplAccountData(amount: bigint): Buffer {
  const buf = Buffer.alloc(165); // standard SPL account layout size
  const lo = Number(amount & 0xffffffffn);
  const hi = Number(amount >> 32n);
  buf.writeUInt32LE(lo, 64);
  buf.writeUInt32LE(hi, 68);
  return buf;
}

const FAKE_WALLET = '0xWallet1234';
const FAKE_TOKEN = '0xToken5678';
const FAKE_RPC = 'https://fake-rpc.test';
const FAKE_MINT = 'USDTmint1111111111111111111111111111111111';
const FAKE_SOL_WALLET = 'SolWallet1111111111111111111111111111111111';

// ── Tests: probeEvmBalance ────────────────────────────────────────────────────

describe('probeEvmBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns bigint balance from contract.balanceOf', async () => {
    const redis = makeRedis();
    mockBalanceOf.mockResolvedValue(1_000_000n);

    const result = await probeEvmBalance(redis, FAKE_RPC, FAKE_WALLET, FAKE_TOKEN, 'bnb', 'USDT');

    expect(result).toBe(1_000_000n);
    expect(mockProviderDestroy).toHaveBeenCalled();
  });

  it('returns cached value without hitting RPC', async () => {
    const redis = makeRedis('9999999');

    const result = await probeEvmBalance(redis, FAKE_RPC, FAKE_WALLET, FAKE_TOKEN, 'bnb', 'USDT');

    expect(result).toBe(9_999_999n);
    expect(mockBalanceOf).not.toHaveBeenCalled();
    expect(mockProviderDestroy).not.toHaveBeenCalled();
  });

  it('stores result in Redis cache after RPC call', async () => {
    const redis = makeRedis();
    mockBalanceOf.mockResolvedValue(42_000n);

    await probeEvmBalance(redis, FAKE_RPC, FAKE_WALLET, FAKE_TOKEN, 'bnb', 'USDT');

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('balance:bnb'),
      '42000',
      'EX',
      expect.any(Number)
    );
  });

  it('destroys provider even when balanceOf throws', async () => {
    const redis = makeRedis();
    mockBalanceOf.mockRejectedValue(new Error('RPC timeout'));

    await expect(
      probeEvmBalance(redis, FAKE_RPC, FAKE_WALLET, FAKE_TOKEN, 'bnb', 'USDT')
    ).rejects.toThrow('RPC timeout');

    expect(mockProviderDestroy).toHaveBeenCalled();
  });
});

// ── Tests: probeSolanaBalance ─────────────────────────────────────────────────

describe('probeSolanaBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sums SPL token accounts for the owner', async () => {
    const redis = makeRedis();
    const amount1 = 500_000n;
    const amount2 = 300_000n;
    mockGetTokenAccountsByOwner.mockResolvedValue({
      value: [
        { account: { data: makeSplAccountData(amount1) } },
        { account: { data: makeSplAccountData(amount2) } },
      ],
    });

    const mockConn = { getTokenAccountsByOwner: mockGetTokenAccountsByOwner } as never;
    const result = await probeSolanaBalance(redis, mockConn, FAKE_SOL_WALLET, FAKE_MINT, 'USDT');

    expect(result).toBe(amount1 + amount2);
  });

  it('returns 0 when no token accounts found', async () => {
    const redis = makeRedis();
    mockGetTokenAccountsByOwner.mockResolvedValue({ value: [] });

    const mockConn = { getTokenAccountsByOwner: mockGetTokenAccountsByOwner } as never;
    const result = await probeSolanaBalance(redis, mockConn, FAKE_SOL_WALLET, FAKE_MINT, 'USDC');

    expect(result).toBe(0n);
  });

  it('returns cached value without calling getTokenAccountsByOwner', async () => {
    const redis = makeRedis('777777');

    const mockConn = { getTokenAccountsByOwner: mockGetTokenAccountsByOwner } as never;
    const result = await probeSolanaBalance(redis, mockConn, FAKE_SOL_WALLET, FAKE_MINT, 'USDT');

    expect(result).toBe(777_777n);
    expect(mockGetTokenAccountsByOwner).not.toHaveBeenCalled();
  });
});

// ── Tests: probeBatch ─────────────────────────────────────────────────────────

describe('probeBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns balanceMinor=null and stale=true when probe fails', async () => {
    const redis = makeRedis();
    // balanceOf throws for this test
    mockBalanceOf.mockRejectedValue(new Error('RPC error'));

    const requests: ProbeRequest[] = [{ chain: 'bnb', address: FAKE_WALLET, token: 'USDT' }];
    const batchCfg: ProbeBatchConfig = {
      rpcBnb: FAKE_RPC,
      rpcSolana: FAKE_RPC,
      solanaConnection: { getTokenAccountsByOwner: mockGetTokenAccountsByOwner } as never,
      usdtBnbAddr: FAKE_TOKEN,
      usdcBnbAddr: FAKE_TOKEN,
      usdtSolMint: FAKE_MINT,
      usdcSolMint: FAKE_MINT,
    };

    const results = await probeBatch(redis, requests, batchCfg);

    expect(results).toHaveLength(1);
    expect(results[0]!.balanceMinor).toBeNull();
    expect(results[0]!.stale).toBe(true);
  });

  it('returns correct balanceMinor string on success', async () => {
    const redis = makeRedis();
    mockBalanceOf.mockResolvedValue(12_345n);

    const requests: ProbeRequest[] = [{ chain: 'bnb', address: FAKE_WALLET, token: 'USDT' }];
    const batchCfg: ProbeBatchConfig = {
      rpcBnb: FAKE_RPC,
      rpcSolana: FAKE_RPC,
      solanaConnection: { getTokenAccountsByOwner: mockGetTokenAccountsByOwner } as never,
      usdtBnbAddr: FAKE_TOKEN,
      usdcBnbAddr: FAKE_TOKEN,
      usdtSolMint: FAKE_MINT,
      usdcSolMint: FAKE_MINT,
    };

    const results = await probeBatch(redis, requests, batchCfg);

    expect(results[0]!.balanceMinor).toBe('12345');
    expect(results[0]!.stale).toBe(false);
  });
});
