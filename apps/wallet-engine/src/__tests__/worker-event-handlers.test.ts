// Tests covering BullMQ worker event handler registration (completed/failed/error/closing)
// for signer-ceremony-broadcast-worker, withdrawal-execute-worker, sweep-execute-worker.
// These event handler lines are not covered by the existing processor-level tests.
// Strategy: intercept the Worker constructor's .on() calls and verify registration.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';

// ── Shared config fixture ─────────────────────────────────────────────────────

const cfg = {
  ADMIN_API_BASE_URL: 'https://admin.test',
  SVC_BEARER_TOKEN: 'svc-token-1234567',
  DATABASE_URL: 'postgres://fake',
  WATCHER_ENABLED: false,
  USDT_BNB_ADDRESS: '0xUSDT',
  USDC_BNB_ADDRESS: '0xUSDC',
  USDT_SOL_MINT: 'USDTmint',
  USDC_SOL_MINT: 'USDCmint',
  POLICY_ENGINE_BASE_URL: 'http://localhost:3003',
} as unknown as AppConfig;

// ── Shared mock factories ─────────────────────────────────────────────────────

function makeWorkerMock() {
  const mockOn = vi.fn().mockReturnThis();
  return { on: mockOn };
}

// ── signer-ceremony-broadcast-worker ─────────────────────────────────────────

describe('signer-ceremony-broadcast-worker — event handler registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('registers completed, failed, error, closing handlers', async () => {
    const workerInstance = makeWorkerMock();
    vi.doMock('bullmq', () => ({
      Worker: vi.fn().mockImplementation(() => workerInstance),
    }));
    vi.doMock('../queue/worker-heartbeat.js', () => ({
      startHeartbeat: vi.fn().mockReturnValue(vi.fn()),
    }));
    vi.doMock('../db/client.js', () => ({
      makeDb: vi.fn().mockReturnValue({
        query: { signerCeremonies: { findFirst: vi.fn() } },
      }),
    }));
    vi.doMock('@wp/admin-api/db-schema', () => ({ signerCeremonies: { id: 'id' } }));
    vi.doMock('drizzle-orm', () => ({ eq: vi.fn() }));
    vi.doMock('../services/signer-ceremony-evm.js', () => ({
      SENTINEL_OWNER: '0x1',
      buildAddOwnerTx: vi.fn(),
      buildRemoveOwnerTx: vi.fn(),
      buildRotateTx: vi.fn(),
    }));

    const { startSignerCeremonyWorker } = await import(
      '../queue/workers/signer-ceremony-broadcast-worker.js'
    );
    startSignerCeremonyWorker({} as never, cfg);

    const events = workerInstance.on.mock.calls.map(([e]: [string]) => e);
    expect(events).toContain('completed');
    expect(events).toContain('failed');
    expect(events).toContain('error');
    expect(events).toContain('closing');
  });
});

// ── withdrawal-execute-worker ─────────────────────────────────────────────────

describe('withdrawal-execute-worker — event handler registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('registers completed, failed, error, closing handlers', async () => {
    const workerInstance = makeWorkerMock();
    vi.doMock('bullmq', () => ({
      Worker: vi.fn().mockImplementation(() => workerInstance),
    }));
    vi.doMock('../queue/worker-heartbeat.js', () => ({
      startHeartbeat: vi.fn().mockReturnValue(vi.fn()),
    }));
    vi.doMock('../db/client.js', () => ({
      makeDb: vi.fn().mockReturnValue({ execute: vi.fn() }),
    }));
    vi.doMock('../services/kill-switch-db-query.js', () => ({
      isKillSwitchEnabled: vi.fn().mockResolvedValue(false),
    }));

    const { startWithdrawalExecuteWorker } = await import(
      '../queue/workers/withdrawal-execute-worker.js'
    );
    startWithdrawalExecuteWorker({} as never, cfg);

    const events = workerInstance.on.mock.calls.map(([e]: [string]) => e);
    expect(events).toContain('completed');
    expect(events).toContain('failed');
    expect(events).toContain('error');
    expect(events).toContain('closing');
  });
});

// ── sweep-execute-worker ──────────────────────────────────────────────────────

describe('sweep-execute-worker — event handler registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('registers completed, failed, error, closing handlers', async () => {
    const workerInstance = makeWorkerMock();
    vi.doMock('bullmq', () => ({
      Worker: vi.fn().mockImplementation(() => workerInstance),
    }));
    vi.doMock('../queue/worker-heartbeat.js', () => ({
      startHeartbeat: vi.fn().mockReturnValue(vi.fn()),
    }));
    vi.doMock('../db/client.js', () => ({
      makeDb: vi.fn().mockReturnValue({ execute: vi.fn() }),
    }));
    vi.doMock('../services/kill-switch-db-query.js', () => ({
      isKillSwitchEnabled: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock('../queue/workers/sweep-admin-notifier.js', () => ({
      callSweepBroadcasted: vi.fn(),
      callSweepConfirmed: vi.fn(),
    }));
    vi.doMock('../queue/workers/sweep-policy-check.js', () => ({
      checkSweepPolicy: vi.fn().mockResolvedValue({ allow: true }),
    }));
    vi.doMock('../services/sweep-evm.js', () => ({
      buildAndSignSweepEVM: vi.fn(),
      broadcastSweepEVM: vi.fn(),
    }));
    vi.doMock('../services/sweep-solana.js', () => ({
      buildAndSignSweepSolana: vi.fn(),
      broadcastSweepSolana: vi.fn(),
    }));
    vi.doMock('@solana/web3.js', () => ({
      PublicKey: vi.fn(),
    }));

    const { startSweepExecuteWorker } = await import('../queue/workers/sweep-execute-worker.js');
    const deps = {
      bnbPool: { provider: { getTransactionCount: vi.fn(), getFeeData: vi.fn() } },
      solPool: { primary: { getLatestBlockhash: vi.fn() } },
    };
    startSweepExecuteWorker({} as never, cfg, deps as never);

    const events = workerInstance.on.mock.calls.map(([e]: [string]) => e);
    expect(events).toContain('completed');
    expect(events).toContain('failed');
    expect(events).toContain('error');
    expect(events).toContain('closing');
  });
});
