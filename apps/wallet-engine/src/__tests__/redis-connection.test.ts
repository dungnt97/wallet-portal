// Tests for queue/connection.ts — Redis singleton factory and close.
// Mocks ioredis to avoid real Redis connections.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock ioredis ───────────────────────────────────────────────────────────────

const mockOn = vi.fn().mockReturnThis();
const mockQuit = vi.fn().mockResolvedValue('OK');
const MockIORedis = vi.fn().mockImplementation(() => ({
  on: mockOn,
  quit: mockQuit,
  ping: vi.fn().mockResolvedValue('PONG'),
}));

vi.mock('ioredis', () => ({ default: MockIORedis }));

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('redis-connection — getRedisConnection', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules(); // reset singleton state between tests
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('creates ioredis instance with maxRetriesPerRequest=null (BullMQ requirement)', async () => {
    const { getRedisConnection } = await import('../queue/connection.js');
    getRedisConnection('redis://localhost:6379');
    expect(MockIORedis).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.objectContaining({
        maxRetriesPerRequest: null,
      })
    );
  });

  it('returns same instance on second call (singleton)', async () => {
    const { getRedisConnection } = await import('../queue/connection.js');
    const inst1 = getRedisConnection('redis://localhost:6379');
    const inst2 = getRedisConnection('redis://localhost:6379');
    expect(inst1).toBe(inst2);
    expect(MockIORedis).toHaveBeenCalledTimes(1);
  });

  it('registers connect/error/close event handlers', async () => {
    const { getRedisConnection } = await import('../queue/connection.js');
    getRedisConnection('redis://localhost:6379');
    const registeredEvents = mockOn.mock.calls.map(([evt]: [string]) => evt);
    expect(registeredEvents).toContain('connect');
    expect(registeredEvents).toContain('error');
    expect(registeredEvents).toContain('close');
  });
});

describe('redis-connection — closeRedisConnection', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('calls quit() and resets instance to null', async () => {
    const { getRedisConnection, closeRedisConnection } = await import('../queue/connection.js');
    getRedisConnection('redis://localhost:6379');
    await closeRedisConnection();
    expect(mockQuit).toHaveBeenCalledOnce();
    // After close, a new getRedisConnection creates a fresh instance
    getRedisConnection('redis://localhost:6379');
    expect(MockIORedis).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when no instance exists', async () => {
    const { closeRedisConnection } = await import('../queue/connection.js');
    // No getRedisConnection called — should not throw
    await expect(closeRedisConnection()).resolves.toBeUndefined();
    expect(mockQuit).not.toHaveBeenCalled();
  });
});
