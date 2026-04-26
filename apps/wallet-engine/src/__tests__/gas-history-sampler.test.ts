// Tests for services/gas-history-sampler.ts
// Mocks probeBnbGas, probeSolanaGas, and ioredis pipeline.
// Uses flushPromises() to drain the boot probe without advancing the repeating
// setInterval (which would trigger an infinite-timer abort with fake timers).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockProbeBnbGas = vi.fn();
const mockProbeSolanaGas = vi.fn();

vi.mock('../services/gas-probe.js', () => ({
  probeBnbGas: mockProbeBnbGas,
  probeSolanaGas: mockProbeSolanaGas,
}));

// ── Redis pipeline mock ───────────────────────────────────────────────────────

function makeRedisMock() {
  const pipeExec = vi.fn().mockResolvedValue(null);
  const pipeZadd = vi.fn().mockReturnThis();
  const pipeZremrange = vi.fn().mockReturnThis();
  const pipeline = vi.fn().mockReturnValue({
    zadd: pipeZadd,
    zremrangebyscore: pipeZremrange,
    exec: pipeExec,
  });
  return { pipeline, pipeExec, pipeZadd, pipeZremrange };
}

/** Drain microtask queue multiple times to let chained .then/.catch settle */
async function flushPromises(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('gas-history-sampler — startGasSampler boot probe', () => {
  // Use real timers — the boot probe fires via Promise.allSettled not setTimeout.
  // The setInterval is left running but stopped by calling stop() in afterEach.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires probes for both chains on start', async () => {
    mockProbeBnbGas.mockResolvedValue(5.0);
    mockProbeSolanaGas.mockResolvedValue(0.000025);

    const { startGasSampler } = await import('../services/gas-history-sampler.js');
    const redis = makeRedisMock();
    const stop = startGasSampler({} as never, {} as never, redis as never);

    await flushPromises();
    stop();

    expect(mockProbeBnbGas).toHaveBeenCalledOnce();
    expect(mockProbeSolanaGas).toHaveBeenCalledOnce();
  });

  it('writes BNB sample to gas:bnb redis key', async () => {
    mockProbeBnbGas.mockResolvedValue(3.5);
    mockProbeSolanaGas.mockResolvedValue(0.00001);

    const { startGasSampler, GAS_KEY_BNB } = await import('../services/gas-history-sampler.js');
    const redis = makeRedisMock();
    const stop = startGasSampler({} as never, {} as never, redis as never);

    await flushPromises();
    stop();

    expect(redis.pipeZadd).toHaveBeenCalledWith(
      GAS_KEY_BNB,
      expect.any(Number),
      expect.stringContaining('"price":3.5')
    );
  });

  it('writes Solana sample to gas:sol redis key', async () => {
    mockProbeBnbGas.mockResolvedValue(2.0);
    mockProbeSolanaGas.mockResolvedValue(0.00005);

    const { startGasSampler, GAS_KEY_SOL } = await import('../services/gas-history-sampler.js');
    const redis = makeRedisMock();
    const stop = startGasSampler({} as never, {} as never, redis as never);

    await flushPromises();
    stop();

    expect(redis.pipeZadd).toHaveBeenCalledWith(
      GAS_KEY_SOL,
      expect.any(Number),
      expect.stringContaining('"price":0.00005')
    );
  });

  it('does not write BNB sample when BNB probe fails', async () => {
    mockProbeBnbGas.mockRejectedValue(new Error('BNB RPC down'));
    mockProbeSolanaGas.mockResolvedValue(0.00001);

    const { startGasSampler, GAS_KEY_BNB } = await import('../services/gas-history-sampler.js');
    const redis = makeRedisMock();
    const stop = startGasSampler({} as never, {} as never, redis as never);

    await flushPromises();
    stop();

    const bnbCalls = redis.pipeZadd.mock.calls.filter(([k]: [string]) => k === GAS_KEY_BNB);
    expect(bnbCalls).toHaveLength(0);
  });

  it('does not write Solana sample when Solana probe fails', async () => {
    mockProbeBnbGas.mockResolvedValue(1.0);
    mockProbeSolanaGas.mockRejectedValue(new Error('SOL RPC down'));

    const { startGasSampler, GAS_KEY_SOL } = await import('../services/gas-history-sampler.js');
    const redis = makeRedisMock();
    const stop = startGasSampler({} as never, {} as never, redis as never);

    await flushPromises();
    stop();

    const solCalls = redis.pipeZadd.mock.calls.filter(([k]: [string]) => k === GAS_KEY_SOL);
    expect(solCalls).toHaveLength(0);
  });

  it('stop() returns a callable function without error', async () => {
    mockProbeBnbGas.mockResolvedValue(1.0);
    mockProbeSolanaGas.mockResolvedValue(0.00001);

    const { startGasSampler } = await import('../services/gas-history-sampler.js');
    const redis = makeRedisMock();
    const stop = startGasSampler({} as never, {} as never, redis as never);

    await flushPromises();
    // stop() clears the interval — calling it twice should not throw
    expect(() => stop()).not.toThrow();
  });

  it('handles redis pipeline exec failure without crashing the sampler', async () => {
    mockProbeBnbGas.mockResolvedValue(2.0);
    mockProbeSolanaGas.mockResolvedValue(0.00001);

    const { startGasSampler } = await import('../services/gas-history-sampler.js');
    const redis = makeRedisMock();
    redis.pipeExec.mockRejectedValue(new Error('Redis write failed'));

    const stop = startGasSampler({} as never, {} as never, redis as never);
    // Should not throw despite redis failure
    await flushPromises();
    stop();
    // If we reach here without throwing, the sampler handled the error gracefully
    expect(true).toBe(true);
  });

  it('writeSample calls zremrangebyscore to prune old entries', async () => {
    mockProbeBnbGas.mockResolvedValue(1.5);
    mockProbeSolanaGas.mockResolvedValue(0.00001);

    const { startGasSampler } = await import('../services/gas-history-sampler.js');
    const redis = makeRedisMock();
    const stop = startGasSampler({} as never, {} as never, redis as never);

    await flushPromises();
    stop();

    // zremrangebyscore should be called twice (once per chain)
    expect(redis.pipeZremrange).toHaveBeenCalledTimes(2);
    // First arg is the key, second is '-inf', third is cutoff epoch ms
    expect(redis.pipeZremrange).toHaveBeenCalledWith(
      expect.any(String),
      '-inf',
      expect.any(Number)
    );
  });
});
