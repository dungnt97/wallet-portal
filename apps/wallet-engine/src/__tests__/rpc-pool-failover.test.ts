// Unit tests for RPC pool retry/failover logic — no real network calls
import { describe, it, expect, vi } from 'vitest';
import { withRetry, withFailover } from '../rpc/pool.js';

describe('withRetry', () => {
  it('returns value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds on second attempt', async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 2) throw new Error('transient');
      return 'recovered';
    });
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent'));
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow(
      'permanent',
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('withFailover', () => {
  it('uses first provider on success', async () => {
    const providers = ['p1', 'p2'];
    const fn = vi.fn().mockResolvedValue('first-success');
    const result = await withFailover(providers, fn, { maxAttempts: 1 });
    expect(result).toBe('first-success');
    expect(fn).toHaveBeenCalledWith('p1');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fails over to second provider when first exhausts retries', async () => {
    const providers = ['bad', 'good'];
    const fn = vi.fn().mockImplementation(async (p: string) => {
      if (p === 'bad') throw new Error('bad provider');
      return 'fallback-success';
    });
    const result = await withFailover(providers, fn, { maxAttempts: 1 });
    expect(result).toBe('fallback-success');
  });

  it('throws when all providers fail', async () => {
    const providers = ['p1', 'p2'];
    const fn = vi.fn().mockRejectedValue(new Error('all broken'));
    await expect(withFailover(providers, fn, { maxAttempts: 1 })).rejects.toThrow(
      'all broken',
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws with message when providers list is empty', async () => {
    await expect(
      withFailover([], async () => 'x', { maxAttempts: 1 }),
    ).rejects.toThrow('All RPC providers failed');
  });
});
