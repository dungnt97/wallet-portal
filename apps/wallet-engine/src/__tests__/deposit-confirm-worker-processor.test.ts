// Tests for deposit-confirm-worker.ts processor paths at 47.75% coverage.
// Covers: dev-mode (watcher disabled), simulated=true override, credit 409
// idempotency, credit failure throw. RPC paths covered by checkBnbConfirmations
// and checkSolanaConfirmations unit tests in deposit-confirm-worker.test.ts.
// Strategy: mock bullmq + creditDeposit, extract processor via Worker constructor mock.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';

// ── Top-level mocks (hoisted before imports) ──────────────────────────────────

const mockCreditDeposit = vi.fn();

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: unknown) => ({
    _processor: processor,
    on: vi.fn(),
  })),
}));

vi.mock('../queue/worker-heartbeat.js', () => ({
  startHeartbeat: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock('../services/admin-api-client.js', () => ({
  creditDeposit: mockCreditDeposit,
}));

// ── Config fixtures ────────────────────────────────────────────────────────────

const devCfg = {
  ADMIN_API_BASE_URL: 'https://admin.test',
  SVC_BEARER_TOKEN: 'svc-token-test-1234567',
  RPC_BNB_PRIMARY: 'https://fake-bnb-rpc',
  RPC_SOLANA_PRIMARY: 'https://fake-solana-rpc',
  WATCHER_ENABLED: false,
} as unknown as AppConfig;

const prodCfg = { ...devCfg, WATCHER_ENABLED: true } as unknown as AppConfig;

// ── Factories ─────────────────────────────────────────────────────────────────

function makeJob(data: Record<string, unknown>) {
  return { id: 'dc-job-1', data };
}

// ── Helper: boot a fresh worker instance and extract its processor ─────────────
// resetModules ensures the Worker mock call-list is fresh per test.

async function bootProcessor(cfg: AppConfig) {
  const { startDepositConfirmWorker } = await import('../queue/workers/deposit-confirm-worker.js');
  const { Worker } = await import('bullmq');
  startDepositConfirmWorker({} as never, cfg);
  const calls = vi.mocked(Worker).mock.calls;
  return calls[calls.length - 1]?.[1] as unknown as (
    job: ReturnType<typeof makeJob>
  ) => Promise<void>;
}

// ── Tests: dev/simulated mode ─────────────────────────────────────────────────

describe('deposit-confirm-worker processor — dev mode (WATCHER_ENABLED=false)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {});

  it('credits deposit without RPC check when watcher disabled', async () => {
    mockCreditDeposit.mockResolvedValue({ success: true });

    const processor = await bootProcessor(devCfg);
    await processor(makeJob({ depositId: 'dep-1', txHash: '0xhash', chain: 'bnb' }));

    expect(mockCreditDeposit).toHaveBeenCalledOnce();
    expect(mockCreditDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ bearerToken: devCfg.SVC_BEARER_TOKEN }),
      'dep-1'
    );
  });

  it('credits deposit when simulated=true (overrides watcher state)', async () => {
    mockCreditDeposit.mockResolvedValue({ success: true });

    // Use prod cfg but simulated=true — should still skip RPC
    const processor = await bootProcessor(prodCfg);
    await processor(
      makeJob({ depositId: 'dep-sim', txHash: '0xhash', chain: 'sol', simulated: true })
    );

    expect(mockCreditDeposit).toHaveBeenCalledOnce();
  });

  it('credit returns 409 — treated as success (idempotency, no throw)', async () => {
    mockCreditDeposit.mockResolvedValue({ success: false, status: 409 });

    const processor = await bootProcessor(devCfg);
    await expect(
      processor(makeJob({ depositId: 'dep-dup', txHash: '0xhash', chain: 'bnb' }))
    ).resolves.toBeUndefined();
  });

  it('credit non-409 failure — throws for BullMQ retry', async () => {
    mockCreditDeposit.mockResolvedValue({ success: false, status: 500 });

    const processor = await bootProcessor(devCfg);
    await expect(
      processor(makeJob({ depositId: 'dep-fail', txHash: '0xhash', chain: 'bnb' }))
    ).rejects.toThrow('Credit failed');
  });

  it('credit failure message includes depositId and status', async () => {
    mockCreditDeposit.mockResolvedValue({ success: false, status: 503 });

    const processor = await bootProcessor(devCfg);
    await expect(
      processor(makeJob({ depositId: 'dep-503', txHash: '0xhash', chain: 'sol' }))
    ).rejects.toThrow('dep-503');
  });

  it('dev mode: passes baseUrl to creditDeposit', async () => {
    mockCreditDeposit.mockResolvedValue({ success: true });

    const processor = await bootProcessor(devCfg);
    await processor(makeJob({ depositId: 'dep-url', txHash: '0xhash', chain: 'bnb' }));

    expect(mockCreditDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://admin.test' }),
      'dep-url'
    );
  });
});

// ── Tests: worker event handlers (completed/failed/error/closing) ─────────────

describe('deposit-confirm-worker — worker event handlers registered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers completed, failed, error, closing event handlers', async () => {
    const mockOn = vi.fn();
    const { Worker } = await import('bullmq');
    vi.mocked(Worker).mockImplementationOnce(
      (_name: string, _processor: unknown) =>
        ({
          _processor: _processor,
          on: mockOn,
        }) as never
    );

    const { startDepositConfirmWorker } = await import(
      '../queue/workers/deposit-confirm-worker.js'
    );
    startDepositConfirmWorker({} as never, devCfg);

    const registeredEvents = mockOn.mock.calls.map(([evt]: [string]) => evt);
    expect(registeredEvents).toContain('completed');
    expect(registeredEvents).toContain('failed');
    expect(registeredEvents).toContain('error');
    expect(registeredEvents).toContain('closing');
  });
});
