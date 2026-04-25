// Unit tests for worker-heartbeat.
// Verifies Redis key write on startup, interval scheduling, and cleanup.
// No real Redis connection — IORedis is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHeartbeat } from '../queue/worker-heartbeat.js';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeRedis(setImpl?: () => Promise<string>) {
  const mock = {
    set: vi.fn().mockImplementation(setImpl ?? (() => Promise.resolve('OK'))),
  };
  return mock as unknown as import('ioredis').default & typeof mock;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('startHeartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('writes Redis key immediately on startup', () => {
    const redis = makeRedis();
    startHeartbeat(redis, 'test-worker');

    expect(redis.set).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenCalledWith(
      'worker:test-worker:heartbeat',
      expect.any(String),
      'EX',
      60
    );
  });

  it('key value is a numeric epoch string', () => {
    const redis = makeRedis();
    const before = Date.now();
    startHeartbeat(redis, 'test-worker');
    const after = Date.now();

    const [, value] = vi.mocked(redis.set).mock.calls[0] as [string, string, string, number];
    const ts = Number(value);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('writes again after 10s interval fires', () => {
    const redis = makeRedis();
    startHeartbeat(redis, 'interval-worker');

    expect(redis.set).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    expect(redis.set).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(10_000);
    expect(redis.set).toHaveBeenCalledTimes(3);
  });

  it('stopHeartbeat clears interval — no further writes after stop', () => {
    const redis = makeRedis();
    const stop = startHeartbeat(redis, 'stoppable-worker');

    vi.advanceTimersByTime(10_000);
    expect(redis.set).toHaveBeenCalledTimes(2);

    stop();

    vi.advanceTimersByTime(30_000);
    // Still only 2 calls — interval is cleared
    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it('Redis error on write is swallowed — does not throw', async () => {
    const redis = makeRedis(() => Promise.reject(new Error('connection lost')));

    // startHeartbeat itself must not throw even if Redis rejects
    expect(() => startHeartbeat(redis, 'error-worker')).not.toThrow();

    // Advance by just 1ms to flush the microtask queue for the initial write promise.
    // Do NOT use runAllTimersAsync() — it loops the setInterval indefinitely.
    await vi.advanceTimersByTimeAsync(1);
  });

  it('uses worker name in Redis key (unique per worker type)', () => {
    const redis = makeRedis();
    startHeartbeat(redis, 'withdrawal-execute');

    const [key] = vi.mocked(redis.set).mock.calls[0] as [string];
    expect(key).toBe('worker:withdrawal-execute:heartbeat');
  });

  it('expiry is set to 60 seconds', () => {
    const redis = makeRedis();
    startHeartbeat(redis, 'expiry-check');

    const [, , , ttl] = vi.mocked(redis.set).mock.calls[0] as [string, string, string, number];
    expect(ttl).toBe(60);
  });
});
