// Unit tests for cold-timelock-broadcast-worker.
// Verifies kill-switch delay, status guards, timelock expiry check, and execute trigger.
// No real Redis / DB / admin-api connections.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';

// ── Config fixture ────────────────────────────────────────────────────────────

const cfg = {
  ADMIN_API_BASE_URL: 'https://admin.test',
  SVC_BEARER_TOKEN: 'svc-token-test-1234567',
  DATABASE_URL: 'postgres://fake',
} as unknown as AppConfig;

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockIsKillSwitchEnabled = vi.fn().mockResolvedValue(false);

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: unknown) => ({
    _processor: processor,
    on: vi.fn(),
  })),
}));

vi.mock('../db/client.js', () => ({
  makeDb: vi.fn(() => ({})),
}));

vi.mock('../services/kill-switch-db-query.js', () => ({
  isKillSwitchEnabled: mockIsKillSwitchEnabled,
}));

vi.mock('../queue/worker-heartbeat.js', () => ({
  startHeartbeat: vi.fn().mockReturnValue(vi.fn()),
}));

// ── Factories ─────────────────────────────────────────────────────────────────

function makeJob(data: { withdrawalId: string }) {
  return {
    id: 'ctl-job-1',
    data,
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  };
}

function makeWithdrawal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wd-1',
    status: 'time_locked',
    sourceTier: 'cold',
    multisigOpId: 'op-1',
    timeLockExpiresAt: new Date(Date.now() - 5_000).toISOString(), // expired 5s ago
    collectedSigs: 2,
    requiredSigs: 2,
    ...overrides,
  };
}

function makeResponse(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

// ── Helper: boot worker + extract processor ───────────────────────────────────
// Reuses the same module cache (no resetModules) so vi.mock stubs stay active.

async function bootProcessor() {
  const { startColdTimelockBroadcastWorker } = await import(
    '../queue/workers/cold-timelock-broadcast-worker.js'
  );
  const { Worker } = await import('bullmq');
  startColdTimelockBroadcastWorker({} as never, cfg);
  const calls = vi.mocked(Worker).mock.calls;
  return calls[calls.length - 1]![1] as unknown as (
    job: ReturnType<typeof makeJob>
  ) => Promise<void>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cold-timelock-broadcast-worker — kill-switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKillSwitchEnabled.mockResolvedValue(true); // ON for this suite
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('kill-switch ON: job moved to 30s delay, no fetch calls', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const processor = await bootProcessor();
    const job = makeJob({ withdrawalId: 'wd-ks' });
    await processor(job);

    expect(job.moveToDelayed).toHaveBeenCalledOnce();
    const delay = (job.moveToDelayed as ReturnType<typeof vi.fn>).mock.calls[0]![0] as number;
    expect(delay - Date.now()).toBeGreaterThanOrEqual(28_000);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe('cold-timelock-broadcast-worker — withdrawal not found', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKillSwitchEnabled.mockResolvedValue(false); // OFF for this suite
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('404 from admin-api: job completes without error, no execute call', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(404, null)));
    const processor = await bootProcessor();
    const job = makeJob({ withdrawalId: 'wd-missing' });
    await processor(job);

    const allUrls = (vi.mocked(fetch).mock.calls as [string][]).map(([u]) => u);
    expect(allUrls.every((u) => !u.includes('/execute'))).toBe(true);
    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });
});

describe('cold-timelock-broadcast-worker — status guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKillSwitchEnabled.mockResolvedValue(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['executing', 'completed', 'cancelled'])(
    'status=%s: skips broadcast, no /execute call',
    async (status) => {
      const withdrawal = makeWithdrawal({ status });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, withdrawal)));

      const processor = await bootProcessor();
      const job = makeJob({ withdrawalId: 'wd-skip' });
      await processor(job);

      const allUrls = (vi.mocked(fetch).mock.calls as [string][]).map(([u]) => u);
      expect(allUrls.every((u) => !u.includes('/execute'))).toBe(true);
    }
  );
});

describe('cold-timelock-broadcast-worker — timelock not yet expired', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKillSwitchEnabled.mockResolvedValue(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('timelock still in future: job moved to remaining delay', async () => {
    const futureMs = Date.now() + 60_000;
    const withdrawal = makeWithdrawal({ timeLockExpiresAt: new Date(futureMs).toISOString() });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, withdrawal)));

    const processor = await bootProcessor();
    const job = makeJob({ withdrawalId: 'wd-future' });
    await processor(job);

    expect(job.moveToDelayed).toHaveBeenCalledOnce();
    const delay = (job.moveToDelayed as ReturnType<typeof vi.fn>).mock.calls[0]![0] as number;
    // delay is an absolute epoch ms; should be ~61s ahead of now
    expect(delay - Date.now()).toBeGreaterThan(50_000);
  });
});

describe('cold-timelock-broadcast-worker — signature threshold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKillSwitchEnabled.mockResolvedValue(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collectedSigs < requiredSigs: skips execute', async () => {
    const withdrawal = makeWithdrawal({ collectedSigs: 1, requiredSigs: 2 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, withdrawal)));

    const processor = await bootProcessor();
    const job = makeJob({ withdrawalId: 'wd-sigs' });
    await processor(job);

    const allUrls = (vi.mocked(fetch).mock.calls as [string][]).map(([u]) => u);
    expect(allUrls.every((u) => !u.includes('/execute'))).toBe(true);
  });
});

describe('cold-timelock-broadcast-worker — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKillSwitchEnabled.mockResolvedValue(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('all checks pass: calls POST /internal/withdrawals/:id/execute', async () => {
    const withdrawal = makeWithdrawal();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(makeResponse(200, withdrawal)) // fetchWithdrawal
        .mockResolvedValueOnce(makeResponse(200)) // callExecute
    );

    const processor = await bootProcessor();
    const job = makeJob({ withdrawalId: 'wd-ok' });
    await processor(job);

    const calls = vi.mocked(fetch).mock.calls as [string, RequestInit][];
    const executeCall = calls.find(([url]) => url.includes('/execute'));
    expect(executeCall).toBeDefined();
    expect(executeCall![1].method).toBe('POST');
  });

  it('approved status (not time_locked) also triggers execute', async () => {
    const withdrawal = makeWithdrawal({ status: 'approved' });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(makeResponse(200, withdrawal))
        .mockResolvedValueOnce(makeResponse(200))
    );

    const processor = await bootProcessor();
    const job = makeJob({ withdrawalId: 'wd-approved' });
    await processor(job);

    const calls = vi.mocked(fetch).mock.calls as [string, RequestInit][];
    const executeCall = calls.find(([url]) => url.includes('/execute'));
    expect(executeCall).toBeDefined();
  });
});
