// Unit tests for signer-ceremony-broadcast-worker.
// Validates dev-mode synthetic hash, cancelled/confirmed ceremony guards, and
// admin-api chain-confirmed callback. No real DB / RPC / Redis.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';

// ── Config fixture ────────────────────────────────────────────────────────────

const cfg = {
  ADMIN_API_BASE_URL: 'https://admin.test',
  SVC_BEARER_TOKEN: 'svc-token-test-1234567',
  DATABASE_URL: 'postgres://fake',
} as unknown as AppConfig;

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: unknown) => ({
    _processor: processor,
    on: vi.fn(),
  })),
}));

vi.mock('../queue/worker-heartbeat.js', () => ({
  startHeartbeat: vi.fn().mockReturnValue(vi.fn()),
}));

// drizzle db — findFirst returns a ceremony row by default
const mockFindFirst = vi.fn();
vi.mock('../db/client.js', () => ({
  makeDb: vi.fn(() => ({
    query: { signerCeremonies: { findFirst: mockFindFirst } },
  })),
}));

// drizzle eq helper
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));

// admin-api schema (needed by signer-ceremony-broadcast-worker import chain)
vi.mock('@wp/admin-api/db-schema', () => ({
  signerCeremonies: { id: 'id' },
}));

vi.mock('../services/signer-ceremony-evm.js', () => ({
  SENTINEL_OWNER: '0x0000000000000000000000000000000000000001',
  buildAddOwnerTx: vi.fn().mockReturnValue({ to: '0xSafe', value: 0n, data: '0x', operation: 0 }),
  buildRemoveOwnerTx: vi
    .fn()
    .mockReturnValue({ to: '0xSafe', value: 0n, data: '0x', operation: 0 }),
  buildRotateTx: vi.fn().mockReturnValue({ to: '0xSafe', value: 0n, data: '0x', operation: 0 }),
}));

// ── Factories ─────────────────────────────────────────────────────────────────

function makeJob(data: Record<string, unknown>) {
  return {
    id: 'sc-job-1',
    data,
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  };
}

function makeCeremony(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ceremony-1',
    status: 'pending',
    operationType: 'signer_add',
    chainStates: {},
    metadata: { newOwner: '0xNew', oldOwner: '0xOld', prevOwner: '0xPrev', threshold: '2' },
    ...overrides,
  };
}

function makeOkResponse(body: unknown = {}) {
  return { ok: true, status: 200, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

// ── Helper: boot worker + extract processor ───────────────────────────────────

async function bootProcessor() {
  const { startSignerCeremonyWorker } = await import(
    '../queue/workers/signer-ceremony-broadcast-worker.js'
  );
  const { Worker } = await import('bullmq');
  startSignerCeremonyWorker({} as never, cfg);
  const calls = vi.mocked(Worker).mock.calls;
  return calls[calls.length - 1]![1] as unknown as (
    job: ReturnType<typeof makeJob>
  ) => Promise<void>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('signer-ceremony-broadcast-worker — dev-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = 'true';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.AUTH_DEV_MODE;
  });

  it('dev mode: generates synthetic hash and calls /chain-confirmed', async () => {
    mockFindFirst.mockResolvedValue(makeCeremony());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse()));

    const processor = await bootProcessor();
    const job = makeJob({ ceremonyId: 'ceremony-1', chain: 'bnb' });
    await processor(job);

    const calls = vi.mocked(fetch).mock.calls as [string, RequestInit][];
    const confirmed = calls.find(([url]) => url.includes('/chain-confirmed'));
    expect(confirmed).toBeDefined();

    const body = JSON.parse(confirmed![1].body as string) as { txHash: string; chain: string };
    expect(body.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.chain).toBe('bnb');
  });

  it('dev mode SOL: calls /chain-confirmed with sol chain', async () => {
    mockFindFirst.mockResolvedValue(makeCeremony());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse()));

    const processor = await bootProcessor();
    const job = makeJob({ ceremonyId: 'ceremony-1', chain: 'sol' });
    await processor(job);

    const calls = vi.mocked(fetch).mock.calls as [string, RequestInit][];
    const confirmed = calls.find(([url]) => url.includes('/chain-confirmed'));
    const body = JSON.parse(confirmed![1].body as string) as { chain: string };
    expect(body.chain).toBe('sol');
  });
});

describe('signer-ceremony-broadcast-worker — idempotency guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = 'true';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.AUTH_DEV_MODE;
  });

  it('chain already confirmed with txHash: skips, no fetch call', async () => {
    const ceremony = makeCeremony({
      chainStates: { bnb: { status: 'confirmed', txHash: '0xalreadyDone' } },
    });
    mockFindFirst.mockResolvedValue(ceremony);
    vi.stubGlobal('fetch', vi.fn());

    const processor = await bootProcessor();
    const job = makeJob({ ceremonyId: 'ceremony-1', chain: 'bnb' });
    await processor(job);

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe('signer-ceremony-broadcast-worker — cancelled ceremony', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = 'true';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.AUTH_DEV_MODE;
  });

  it('ceremony.status=cancelled: skips broadcast, no fetch call', async () => {
    mockFindFirst.mockResolvedValue(makeCeremony({ status: 'cancelled' }));
    vi.stubGlobal('fetch', vi.fn());

    const processor = await bootProcessor();
    const job = makeJob({ ceremonyId: 'ceremony-1', chain: 'bnb' });
    await processor(job);

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe('signer-ceremony-broadcast-worker — ceremony not found', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = 'true';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.AUTH_DEV_MODE;
  });

  it('ceremony row missing in DB: returns without throwing or calling fetch', async () => {
    mockFindFirst.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn());

    const processor = await bootProcessor();
    const job = makeJob({ ceremonyId: 'ceremony-missing', chain: 'bnb' });
    await expect(processor(job)).resolves.toBeUndefined();

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe('signer-ceremony-broadcast-worker — chain-confirmed failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = 'true';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.AUTH_DEV_MODE;
  });

  it('chain-confirmed returns 500: calls /chain-failed and re-throws for BullMQ retry', async () => {
    mockFindFirst.mockResolvedValue(makeCeremony());
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: vi.fn().mockResolvedValue({}),
        } as unknown as Response)
        .mockResolvedValueOnce(makeOkResponse()) // chain-failed callback
    );

    const processor = await bootProcessor();
    const job = makeJob({ ceremonyId: 'ceremony-1', chain: 'bnb' });
    await expect(processor(job)).rejects.toThrow();

    const calls = vi.mocked(fetch).mock.calls as [string][];
    const failedCall = calls.find(([url]) => url.includes('/chain-failed'));
    expect(failedCall).toBeDefined();
  });
});
