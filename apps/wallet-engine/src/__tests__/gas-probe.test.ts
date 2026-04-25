// Unit tests for gas-probe service.
// Covers BNB getFeeData path, Solana median prioritization fee, edge cases.
// No real RPC connections.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeBnbGas, probeSolanaGas } from '../services/gas-probe.js';

// ── Tests: probeBnbGas ────────────────────────────────────────────────────────

describe('probeBnbGas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeProvider(gasPrice: bigint | null, maxFeePerGas: bigint | null = null) {
    return {
      getFeeData: vi.fn().mockResolvedValue({ gasPrice, maxFeePerGas }),
    } as never;
  }

  it('returns gwei from gasPrice (2 decimal places)', async () => {
    // 5_000_000_000 wei = 5.00 gwei
    const provider = makeProvider(5_000_000_000n);
    const result = await probeBnbGas(provider);
    expect(result).toBe(5);
  });

  it('falls back to maxFeePerGas when gasPrice is null', async () => {
    // 3_000_000_000 wei = 3.00 gwei
    const provider = makeProvider(null, 3_000_000_000n);
    const result = await probeBnbGas(provider);
    expect(result).toBe(3);
  });

  it('throws when both gasPrice and maxFeePerGas are null', async () => {
    const provider = makeProvider(null, null);
    await expect(probeBnbGas(provider)).rejects.toThrow('no gas price');
  });

  it('handles fractional gwei (1.5 gwei = 1_500_000_000 wei)', async () => {
    const provider = makeProvider(1_500_000_000n);
    const result = await probeBnbGas(provider);
    expect(result).toBe(1.5);
  });

  it('propagates RPC error', async () => {
    const provider = {
      getFeeData: vi.fn().mockRejectedValue(new Error('RPC timeout')),
    } as never;
    await expect(probeBnbGas(provider)).rejects.toThrow('RPC timeout');
  });
});

// ── Tests: probeSolanaGas ─────────────────────────────────────────────────────

describe('probeSolanaGas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeConnection(fees: { prioritizationFee: number; slot: number }[]) {
    return {
      getRecentPrioritizationFees: vi.fn().mockResolvedValue(fees),
    } as never;
  }

  it('returns 0 when no fees returned (unloaded network)', async () => {
    const conn = makeConnection([]);
    const result = await probeSolanaGas(conn);
    expect(result).toBe(0);
  });

  it('returns median of odd-length fee array', async () => {
    // sorted: [1000, 2000, 3000] → median = 2000
    const conn = makeConnection([
      { prioritizationFee: 3000, slot: 1 },
      { prioritizationFee: 1000, slot: 2 },
      { prioritizationFee: 2000, slot: 3 },
    ]);
    const result = await probeSolanaGas(conn);
    // median microLamports=2000 → SOL/sig = 2000/1_000_000_000_000 = 2e-9
    expect(result).toBeCloseTo(2000 / 1_000_000_000_000, 15);
  });

  it('returns average of two middle values for even-length array', async () => {
    // sorted: [1000, 2000, 3000, 4000] → median = (2000+3000)/2 = 2500
    const conn = makeConnection([
      { prioritizationFee: 4000, slot: 1 },
      { prioritizationFee: 1000, slot: 2 },
      { prioritizationFee: 3000, slot: 3 },
      { prioritizationFee: 2000, slot: 4 },
    ]);
    const result = await probeSolanaGas(conn);
    expect(result).toBeCloseTo(2500 / 1_000_000_000_000, 15);
  });

  it('single-element array: returns that element as median', async () => {
    const conn = makeConnection([{ prioritizationFee: 5000, slot: 1 }]);
    const result = await probeSolanaGas(conn);
    expect(result).toBeCloseTo(5000 / 1_000_000_000_000, 15);
  });

  it('propagates RPC error', async () => {
    const conn = {
      getRecentPrioritizationFees: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as never;
    await expect(probeSolanaGas(conn)).rejects.toThrow('connection refused');
  });
});
