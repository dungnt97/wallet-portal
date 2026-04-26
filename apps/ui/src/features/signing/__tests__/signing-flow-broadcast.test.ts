// Tests for signing-flow-broadcast.ts — broadcastDevMode and makeBroadcastResult.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { broadcastDevMode, makeBroadcastResult } from '../signing-flow-broadcast';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../mock-adapters', () => ({
  mockBroadcast: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── makeBroadcastResult ───────────────────────────────────────────────────────

describe('makeBroadcastResult', () => {
  it('returns object with the provided txHash as hash', () => {
    const result = makeBroadcastResult('0xdeadbeef');
    expect(result.hash).toBe('0xdeadbeef');
  });

  it('returns blockNumber of 0', () => {
    const result = makeBroadcastResult('0xabc');
    expect(result.blockNumber).toBe(0);
  });

  it('returns confirmedAt as a valid ISO string', () => {
    const before = Date.now();
    const result = makeBroadcastResult('0xabc');
    const after = Date.now();
    const ts = new Date(result.confirmedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('has the correct BroadcastResult shape', () => {
    const result = makeBroadcastResult('0xtest');
    expect(result).toHaveProperty('hash');
    expect(result).toHaveProperty('blockNumber');
    expect(result).toHaveProperty('confirmedAt');
  });

  it('works with a Solana base58 tx hash', () => {
    const hash = '5vFXNHyHBNJMBNfNQpnNRHWb2rC7JZqx3CxKr7JRs1GzXjZqY3JM5FvwWDvxK9B2';
    const result = makeBroadcastResult(hash);
    expect(result.hash).toBe(hash);
    expect(result.blockNumber).toBe(0);
  });
});

// ── broadcastDevMode ──────────────────────────────────────────────────────────

describe('broadcastDevMode', () => {
  it('delegates to mockBroadcast with the given op', async () => {
    const { mockBroadcast } = await import('../mock-adapters');
    const fakeResult = {
      hash: '0xmockhash',
      blockNumber: 123,
      confirmedAt: new Date().toISOString(),
    };
    vi.mocked(mockBroadcast).mockResolvedValue(fakeResult);

    const op = {
      id: 'wd-1',
      chain: 'bnb' as const,
      token: 'USDT' as const,
      amount: 100,
      destination: '0xDest',
      signaturesRequired: 2,
      totalSigners: 3,
    };
    const result = await broadcastDevMode(op);

    expect(mockBroadcast).toHaveBeenCalledWith(op);
    expect(result).toEqual(fakeResult);
  });

  it('returns BroadcastResult from mockBroadcast', async () => {
    const { mockBroadcast } = await import('../mock-adapters');
    const fakeResult = {
      hash: '0xabc123',
      blockNumber: 42_000_001,
      confirmedAt: '2024-01-01T00:00:00.000Z',
    };
    vi.mocked(mockBroadcast).mockResolvedValue(fakeResult);

    const op = {
      id: 'wd-2',
      chain: 'sol' as const,
      token: 'USDC' as const,
      amount: 50,
      destination: 'SolDest',
      signaturesRequired: 1,
      totalSigners: 2,
    };
    const result = await broadcastDevMode(op);

    expect(result.hash).toBe('0xabc123');
    expect(result.blockNumber).toBe(42_000_001);
  });

  it('propagates rejection from mockBroadcast', async () => {
    const { mockBroadcast } = await import('../mock-adapters');
    vi.mocked(mockBroadcast).mockRejectedValue(new Error('network error'));

    const op = {
      id: 'wd-3',
      chain: 'bnb' as const,
      token: 'USDT' as const,
      amount: 10,
      destination: '0xFail',
      signaturesRequired: 2,
      totalSigners: 3,
    };
    await expect(broadcastDevMode(op)).rejects.toThrow('network error');
  });
});
