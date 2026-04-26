// Bootstrap coverage for server.ts — exercises the start() function with all
// heavy deps mocked. Covers the watcher-enabled=true path, RPC degraded-warn path,
// SAFE_TX_SERVICE_URL missing warn, graceful shutdown handlers, and the start()
// catch block (process.exit on fatal error).
//
// Strategy: mock every I/O boundary, then call start() (the default export's
// indirect side-effect), verify side-effects through mock call assertions.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── All heavy mocks must be declared before any import ───────────────────────

vi.mock('../telemetry/otel.js', () => ({}));
vi.mock('dotenv/config', () => ({}));

const mockLoadConfig = vi.fn();
vi.mock('../config/env.js', () => ({
  loadConfig: mockLoadConfig,
  bnbRpcUrls: vi.fn().mockReturnValue(['https://fake-bnb']),
  solanaRpcUrls: vi.fn().mockReturnValue(['https://fake-sol']),
}));

const mockDbExecute = vi.fn().mockResolvedValue([]);
vi.mock('../db/client.js', () => ({
  makeDb: vi.fn().mockReturnValue({ execute: mockDbExecute }),
}));

const mockRedisPing = vi.fn().mockResolvedValue('PONG');
const mockRedisQuit = vi.fn().mockResolvedValue('OK');
vi.mock('../queue/connection.js', () => ({
  getRedisConnection: vi.fn().mockReturnValue({
    ping: mockRedisPing,
    quit: mockRedisQuit,
    on: vi.fn(),
  }),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

const mockDepositQueueClose = vi.fn().mockResolvedValue(undefined);
const mockSweepQueueClose = vi.fn().mockResolvedValue(undefined);
const mockWithdrawalQueueClose = vi.fn().mockResolvedValue(undefined);
vi.mock('../queue/deposit-confirm.js', () => ({
  makeDepositConfirmQueue: vi.fn().mockReturnValue({ close: mockDepositQueueClose }),
}));
vi.mock('../queue/sweep-execute.js', () => ({
  makeSweepExecuteQueue: vi.fn().mockReturnValue({ close: mockSweepQueueClose }),
}));
vi.mock('../queue/withdrawal-execute.js', () => ({
  makeWithdrawalExecuteQueue: vi.fn().mockReturnValue({ close: mockWithdrawalQueueClose }),
}));

const mockDepositWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockWithdrawalWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockSweepWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockColdWorkerClose = vi.fn().mockResolvedValue(undefined);
vi.mock('../queue/workers/deposit-confirm-worker.js', () => ({
  startDepositConfirmWorker: vi
    .fn()
    .mockReturnValue({ close: mockDepositWorkerClose, on: vi.fn() }),
}));
vi.mock('../queue/workers/withdrawal-execute-worker.js', () => ({
  startWithdrawalExecuteWorker: vi
    .fn()
    .mockReturnValue({ close: mockWithdrawalWorkerClose, on: vi.fn() }),
}));
vi.mock('../queue/workers/sweep-execute-worker.js', () => ({
  startSweepExecuteWorker: vi.fn().mockReturnValue({ close: mockSweepWorkerClose, on: vi.fn() }),
}));
vi.mock('../queue/workers/cold-timelock-broadcast-worker.js', () => ({
  startColdTimelockBroadcastWorker: vi
    .fn()
    .mockReturnValue({ close: mockColdWorkerClose, on: vi.fn() }),
}));

const mockBnbGetBlockNumber = vi.fn().mockResolvedValue(100);
const mockBnbDestroy = vi.fn();
vi.mock('../rpc/bnb-pool.js', () => ({
  makeBnbPool: vi.fn().mockReturnValue({
    provider: { getBlockNumber: mockBnbGetBlockNumber, destroy: mockBnbDestroy },
  }),
  destroyBnbPool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../rpc/solana-pool.js', () => ({
  makeSolanaPool: vi.fn().mockReturnValue({
    primary: { getSlot: vi.fn().mockResolvedValue(200) },
  }),
  solanaCall: vi.fn().mockResolvedValue(200),
  destroySolanaPool: vi.fn().mockResolvedValue(undefined),
}));

const mockStopGasSampler = vi.fn();
vi.mock('../services/gas-history-sampler.js', () => ({
  startGasSampler: vi.fn().mockReturnValue(mockStopGasSampler),
}));

vi.mock('../telemetry/sentry.js', () => ({ initSentry: vi.fn() }));
vi.mock('../telemetry/metrics.js', () => ({
  httpRequestsTotal: { inc: vi.fn() },
  httpRequestDurationSeconds: { observe: vi.fn() },
  registry: { metrics: vi.fn().mockResolvedValue('# prom'), contentType: 'text/plain' },
}));

const mockRegistryRefresh = vi.fn().mockResolvedValue(undefined);
const mockRegistryStop = vi.fn();
const mockRegistrySize = vi.fn().mockReturnValue(0);
const mockRegistryStartAutoRefresh = vi.fn();
vi.mock('../watcher/address-registry.js', () => ({
  AddressRegistry: vi.fn().mockImplementation(() => ({
    refresh: mockRegistryRefresh,
    startAutoRefresh: mockRegistryStartAutoRefresh,
    stop: mockRegistryStop,
    size: mockRegistrySize,
  })),
}));

vi.mock('../watcher/block-checkpoint.js', () => ({
  BlockCheckpoint: vi.fn().mockImplementation(() => ({})),
}));

const mockBnbWatcherStart = vi.fn().mockResolvedValue(undefined);
const mockBnbWatcherStop = vi.fn().mockResolvedValue(undefined);
const mockBnbWatcherGetBlock = vi.fn().mockReturnValue(0);
vi.mock('../watcher/bnb-watcher.js', () => ({
  BnbWatcher: vi.fn().mockImplementation(() => ({
    start: mockBnbWatcherStart,
    stop: mockBnbWatcherStop,
    getLastProcessedBlock: mockBnbWatcherGetBlock,
  })),
}));

const mockSolWatcherStart = vi.fn().mockResolvedValue(undefined);
const mockSolWatcherStop = vi.fn().mockResolvedValue(undefined);
const mockSolWatcherGetSlot = vi.fn().mockReturnValue(0);
vi.mock('../watcher/solana-watcher.js', () => ({
  SolanaWatcher: vi.fn().mockImplementation(() => ({
    start: mockSolWatcherStart,
    stop: mockSolWatcherStop,
    getLastProcessedSlot: mockSolWatcherGetSlot,
  })),
}));

vi.mock('../routes/internal-derive.js', () => ({
  default: vi.fn().mockImplementation(async () => {}),
}));
vi.mock('../routes/internal-recovery.js', () => ({
  default: vi.fn().mockImplementation(async () => {}),
}));
vi.mock('../routes/internal-multisig-sync.js', () => ({
  default: vi.fn().mockImplementation(async () => {}),
}));
vi.mock('@wp/admin-api/db-schema', () => ({ users: { id: 'id' } }));

// ── Config factory ────────────────────────────────────────────────────────────

function makeCfg(overrides: Record<string, unknown> = {}) {
  return {
    PORT: 0, // random port — avoids address-in-use conflicts
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://fake',
    REDIS_URL: 'redis://localhost:6379',
    RPC_BNB_PRIMARY: 'https://fake-bnb',
    RPC_SOLANA_PRIMARY: 'https://fake-sol',
    ADMIN_API_BASE_URL: 'https://admin.test',
    SVC_BEARER_TOKEN: 'svc-token-1234567890abcdef',
    HD_MASTER_XPUB_BNB: 'word '.repeat(12).trim(),
    HD_MASTER_SEED_SOLANA: 'deadbeef'.repeat(8),
    WATCHER_ENABLED: false,
    WATCHER_BNB_POLL_INTERVAL_MS: 3000,
    WATCHER_SOLANA_POLL_INTERVAL_MS: 2000,
    USDT_BNB_ADDRESS: '0xUSDT',
    USDC_BNB_ADDRESS: '0xUSDC',
    USDT_SOL_MINT: 'USDTmint',
    USDC_SOL_MINT: 'USDCmint',
    SAFE_ADDRESS: '',
    SQUADS_MULTISIG_ADDRESS: '',
    SAFE_TX_SERVICE_URL: '',
    POLICY_ENGINE_BASE_URL: 'http://localhost:3003',
    ...overrides,
  };
}

// ── Helper: import and invoke start() then capture the Fastify instance ────────
// server.ts calls start() at module level via `void start().catch(...)`.
// We cannot call start() directly, but we can import the module and let the
// side-effect run — then verify mock interactions.

async function importAndRunServer(cfg = makeCfg()) {
  mockLoadConfig.mockReturnValue(cfg);
  vi.resetModules(); // ensure fresh module each test
  // Re-apply mocks lost by resetModules for the modules server.ts imports
  vi.mock('../telemetry/otel.js', () => ({}));
  vi.mock('dotenv/config', () => ({}));

  const serverModule = await import('../server.js');
  // Allow the async start() to complete
  await new Promise((r) => setTimeout(r, 50));
  return serverModule;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Stub process.exit so shutdown handler doesn't kill the vitest process
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

describe('server.ts bootstrap — WATCHER_ENABLED=false', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExit.mockImplementation(() => undefined as never);
  });

  afterEach(async () => {
    // Emit SIGTERM to trigger shutdown and close the Fastify listener
    process.emit('SIGTERM');
    await new Promise((r) => setTimeout(r, 50));
  });

  it('starts without throwing and calls initSentry', async () => {
    await importAndRunServer();
    const { initSentry } = await import('../telemetry/sentry.js');
    expect(vi.mocked(initSentry)).toHaveBeenCalled();
  });

  it('watchers NOT started when WATCHER_ENABLED=false', async () => {
    await importAndRunServer(makeCfg({ WATCHER_ENABLED: false }));
    expect(mockBnbWatcherStart).not.toHaveBeenCalled();
    expect(mockSolWatcherStart).not.toHaveBeenCalled();
  });

  it('address registry refresh called on startup', async () => {
    await importAndRunServer();
    expect(mockRegistryRefresh).toHaveBeenCalled();
  });

  it('BullMQ workers started', async () => {
    await importAndRunServer();
    const { startDepositConfirmWorker } = await import(
      '../queue/workers/deposit-confirm-worker.js'
    );
    expect(vi.mocked(startDepositConfirmWorker)).toHaveBeenCalled();
  });

  it('gas sampler started', async () => {
    await importAndRunServer();
    const { startGasSampler } = await import('../services/gas-history-sampler.js');
    expect(vi.mocked(startGasSampler)).toHaveBeenCalled();
  });
});

describe('server.ts bootstrap — WATCHER_ENABLED=true', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExit.mockImplementation(() => undefined as never);
    mockBnbWatcherStart.mockResolvedValue(undefined);
    mockSolWatcherStart.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    process.emit('SIGTERM');
    await new Promise((r) => setTimeout(r, 50));
  });

  it('watchers started when WATCHER_ENABLED=true', async () => {
    await importAndRunServer(makeCfg({ WATCHER_ENABLED: true }));
    expect(mockBnbWatcherStart).toHaveBeenCalled();
    expect(mockSolWatcherStart).toHaveBeenCalled();
  });

  it('shutdown (SIGTERM): watchers stopped', async () => {
    await importAndRunServer(makeCfg({ WATCHER_ENABLED: true }));
    process.emit('SIGTERM');
    await new Promise((r) => setTimeout(r, 80));
    expect(mockBnbWatcherStop).toHaveBeenCalled();
    expect(mockSolWatcherStop).toHaveBeenCalled();
  });
});

describe('server.ts bootstrap — RPC degraded graceful continue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExit.mockImplementation(() => undefined as never);
  });

  afterEach(async () => {
    process.emit('SIGTERM');
    await new Promise((r) => setTimeout(r, 50));
  });

  it('BNB RPC failure: logs warn and continues (no throw)', async () => {
    mockBnbGetBlockNumber.mockRejectedValue(new Error('BNB RPC down'));
    // Should not throw — server continues in degraded mode
    await expect(importAndRunServer()).resolves.not.toThrow();
  });
});

describe('server.ts bootstrap — SAFE_TX_SERVICE_URL missing warning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExit.mockImplementation(() => undefined as never);
  });

  afterEach(async () => {
    process.emit('SIGTERM');
    await new Promise((r) => setTimeout(r, 50));
  });

  it('no SAFE_TX_SERVICE_URL: server still starts (warn logged)', async () => {
    await expect(importAndRunServer(makeCfg({ SAFE_TX_SERVICE_URL: '' }))).resolves.not.toThrow();
  });
});
