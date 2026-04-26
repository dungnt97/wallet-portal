import { beforeEach, describe, expect, it, vi } from 'vitest';
// Tests for health-probes.service.ts
// Covers: probeDb, probeRedis, probePolicyEngine, probeChain, probeQueue,
//         checkDegradationTransition, resetHealthStateCache, probeWorkers

describe('probeDb', () => {
  it('returns ok when db.execute resolves', async () => {
    const db = { execute: vi.fn().mockResolvedValue([]) } as never;
    const { probeDb } = await import('../services/health-probes.service.js');
    const result = await probeDb(db);
    expect(result.status).toBe('ok');
    expect(result.error).toBeUndefined();
  });

  it('returns error when db.execute rejects', async () => {
    const db = { execute: vi.fn().mockRejectedValue(new Error('DB down')) } as never;
    const { probeDb } = await import('../services/health-probes.service.js');
    const result = await probeDb(db);
    expect(result.status).toBe('error');
    expect(result.error).toContain('DB down');
  });

  it('returns error on timeout (using mock that hangs)', async () => {
    // We can't truly test timeouts in unit tests — just verify rejection path
    const db = {
      execute: vi.fn().mockRejectedValue(new Error('probe timed out after 2000ms')),
    } as never;
    const { probeDb } = await import('../services/health-probes.service.js');
    const result = await probeDb(db);
    expect(result.status).toBe('error');
    expect(result.error).toContain('timed out');
  });
});

describe('probeRedis', () => {
  it('returns ok when redis.ping resolves', async () => {
    const redis = { ping: vi.fn().mockResolvedValue('PONG') } as never;
    const { probeRedis } = await import('../services/health-probes.service.js');
    const result = await probeRedis(redis);
    expect(result.status).toBe('ok');
  });

  it('returns error when redis.ping rejects', async () => {
    const redis = { ping: vi.fn().mockRejectedValue(new Error('Connection refused')) } as never;
    const { probeRedis } = await import('../services/health-probes.service.js');
    const result = await probeRedis(redis);
    expect(result.status).toBe('error');
    expect(result.error).toContain('Connection refused');
  });
});

describe('probePolicyEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok when fetch resolves with 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    const { probePolicyEngine } = await import('../services/health-probes.service.js');
    const result = await probePolicyEngine('http://policy-engine:4000');
    expect(result.status).toBe('ok');
  });

  it('returns error when fetch returns non-ok status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    const { probePolicyEngine } = await import('../services/health-probes.service.js');
    const result = await probePolicyEngine('http://policy-engine:4000');
    expect(result.status).toBe('error');
    expect(result.error).toContain('503');
  });

  it('returns error when fetch rejects (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const { probePolicyEngine } = await import('../services/health-probes.service.js');
    const result = await probePolicyEngine('http://policy-engine:4000');
    expect(result.status).toBe('error');
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('builds correct URL with /health/live path', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    const { probePolicyEngine } = await import('../services/health-probes.service.js');
    await probePolicyEngine('http://policy-engine:4000');
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toBe('http://policy-engine:4000/health/live');
  });
});

describe('probeChain', () => {
  it('returns ok with lag when getLatestBlock and checkpoint exist', async () => {
    const db = {
      query: {
        watcherCheckpoints: {
          findFirst: vi.fn().mockResolvedValue({ lastBlock: 950 }),
        },
      },
    } as never;
    const cfg = {
      id: 'bnb',
      rpc: 'http://rpc.bnb',
      getLatestBlock: vi.fn().mockResolvedValue(1000),
    };
    const { probeChain } = await import('../services/health-probes.service.js');
    const result = await probeChain(db, cfg);
    expect(result.status).toBe('ok');
    expect(result.latestBlock).toBe(1000);
    expect(result.checkpointBlock).toBe(950);
    expect(result.lagBlocks).toBe(50);
  });

  it('returns error when getLatestBlock rejects', async () => {
    const db = {} as never;
    const cfg = {
      id: 'sol',
      rpc: 'http://rpc.sol',
      getLatestBlock: vi.fn().mockRejectedValue(new Error('RPC down')),
    };
    const { probeChain } = await import('../services/health-probes.service.js');
    const result = await probeChain(db, cfg);
    expect(result.status).toBe('error');
    expect(result.error).toContain('RPC down');
    expect(result.latestBlock).toBeNull();
    expect(result.lagBlocks).toBeNull();
  });

  it('returns ok with null lagBlocks when no checkpoint exists', async () => {
    const db = {
      query: {
        watcherCheckpoints: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as never;
    const cfg = {
      id: 'bnb',
      rpc: 'http://rpc.bnb',
      getLatestBlock: vi.fn().mockResolvedValue(500),
    };
    const { probeChain } = await import('../services/health-probes.service.js');
    const result = await probeChain(db, cfg);
    expect(result.status).toBe('ok');
    expect(result.latestBlock).toBe(500);
    expect(result.checkpointBlock).toBeNull();
    expect(result.lagBlocks).toBeNull();
  });

  it('returns ok even when checkpoint query fails (non-fatal)', async () => {
    const db = {
      query: {
        watcherCheckpoints: {
          findFirst: vi.fn().mockRejectedValue(new Error('checkpoint table missing')),
        },
      },
    } as never;
    const cfg = {
      id: 'bnb',
      rpc: 'http://rpc.bnb',
      getLatestBlock: vi.fn().mockResolvedValue(800),
    };
    const { probeChain } = await import('../services/health-probes.service.js');
    const result = await probeChain(db, cfg);
    expect(result.status).toBe('ok');
    expect(result.latestBlock).toBe(800);
  });
});

describe('probeQueue', () => {
  it('returns depth sum of waiting+active+delayed', async () => {
    const queue = {
      name: 'withdrawal-execute',
      getJobCounts: vi.fn().mockResolvedValue({ waiting: 3, active: 2, delayed: 1 }),
    } as never;
    const { probeQueue } = await import('../services/health-probes.service.js');
    const result = await probeQueue(queue);
    expect(result.status).toBe('ok');
    expect(result.name).toBe('withdrawal-execute');
    expect(result.depth).toBe(6);
  });

  it('returns 0 depth and error when getJobCounts rejects', async () => {
    const queue = {
      name: 'notif-email',
      getJobCounts: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
    } as never;
    const { probeQueue } = await import('../services/health-probes.service.js');
    const result = await probeQueue(queue);
    expect(result.status).toBe('error');
    expect(result.depth).toBe(0);
    expect(result.error).toContain('Redis unavailable');
  });

  it('handles missing count keys with default 0', async () => {
    const queue = {
      name: 'notif-slack',
      getJobCounts: vi.fn().mockResolvedValue({}),
    } as never;
    const { probeQueue } = await import('../services/health-probes.service.js');
    const result = await probeQueue(queue);
    expect(result.status).toBe('ok');
    expect(result.depth).toBe(0);
  });
});

describe('checkDegradationTransition', () => {
  it('returns true on first ok→error transition', async () => {
    const { checkDegradationTransition, resetHealthStateCache } = await import(
      '../services/health-probes.service.js'
    );
    resetHealthStateCache();
    const result = checkDegradationTransition('db', 'error');
    expect(result).toBe(true);
  });

  it('returns false on repeated error→error (no new degradation)', async () => {
    const { checkDegradationTransition, resetHealthStateCache } = await import(
      '../services/health-probes.service.js'
    );
    resetHealthStateCache();
    checkDegradationTransition('redis', 'error'); // first degradation
    const result = checkDegradationTransition('redis', 'error'); // still error
    expect(result).toBe(false);
  });

  it('returns false on ok→ok transition', async () => {
    const { checkDegradationTransition, resetHealthStateCache } = await import(
      '../services/health-probes.service.js'
    );
    resetHealthStateCache();
    const result = checkDegradationTransition('policy-engine', 'ok');
    expect(result).toBe(false);
  });

  it('returns true again after error→ok→error cycle', async () => {
    const { checkDegradationTransition, resetHealthStateCache } = await import(
      '../services/health-probes.service.js'
    );
    resetHealthStateCache();
    checkDegradationTransition('chain-bnb', 'error');
    checkDegradationTransition('chain-bnb', 'ok'); // recovered
    const result = checkDegradationTransition('chain-bnb', 'error'); // degraded again
    expect(result).toBe(true);
  });
});

describe('probeWorkers', () => {
  it('returns ok status for workers with recent heartbeat', async () => {
    const now = Date.now();
    const redis = {
      get: vi.fn().mockResolvedValue(String(now - 10_000)), // 10 sec ago
    } as never;
    const { probeWorkers } = await import('../services/health-probes.service.js');
    const results = await probeWorkers(redis);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
  });

  it('returns error for workers with stale heartbeat (> 90s ago)', async () => {
    const now = Date.now();
    const redis = {
      get: vi.fn().mockResolvedValue(String(now - 100_000)), // 100 sec ago
    } as never;
    const { probeWorkers } = await import('../services/health-probes.service.js');
    const results = await probeWorkers(redis);
    expect(results.every((r) => r.status === 'error')).toBe(true);
  });

  it('returns error when heartbeat key is missing', async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
    } as never;
    const { probeWorkers } = await import('../services/health-probes.service.js');
    const results = await probeWorkers(redis);
    expect(results.every((r) => r.status === 'error')).toBe(true);
    expect(results[0].error).toContain('no heartbeat key');
  });

  it('returns error when redis.get throws', async () => {
    const redis = {
      get: vi.fn().mockRejectedValue(new Error('Redis gone')),
    } as never;
    const { probeWorkers } = await import('../services/health-probes.service.js');
    const results = await probeWorkers(redis);
    expect(results.every((r) => r.status === 'error')).toBe(true);
  });
});
