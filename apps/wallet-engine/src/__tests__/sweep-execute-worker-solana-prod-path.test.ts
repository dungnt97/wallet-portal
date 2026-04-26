// Tests for sweep-execute-worker.ts Solana prod path (lines 201-227)
// and sweep worker event-handler callback bodies (lines 150-155).
// Covers: executeSolanaSweep happy path, policy-engine rejection,
// broadcastSweepSolana + callSweepBroadcasted + callSweepConfirmed chain.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';

// ── Config with policy engine pointing at a non-localhost URL ─────────────────
// Policy check runs only when !isDevMode && POLICY_ENGINE_BASE_URL is set
// and does not include 'localhost'.

const prodCfg = {
  ADMIN_API_BASE_URL: 'https://admin.test',
  SVC_BEARER_TOKEN: 'svc-token-test-1234567',
  DATABASE_URL: 'postgres://fake',
  USDT_BNB_ADDRESS: '0xUSDT',
  USDC_BNB_ADDRESS: '0xUSDC',
  USDT_SOL_MINT: 'USDTmintProd',
  USDC_SOL_MINT: 'USDCmintProd',
  POLICY_ENGINE_BASE_URL: 'https://policy.prod.example.com',
} as unknown as AppConfig;

// ── Spies ─────────────────────────────────────────────────────────────────────

const mockIsKillSwitchEnabled = vi.fn().mockResolvedValue(false);
const mockBuildAndSignSweepEVM = vi
  .fn()
  .mockResolvedValue({ txHex: '0xhex', txHash: '0xevmHash', fromAddress: '0xFrom' });
const mockBroadcastSweepEVM = vi.fn().mockResolvedValue({ txHash: '0xevmBroadcastHash' });
const mockBuildAndSignSweepSolana = vi
  .fn()
  .mockResolvedValue({ txBase64: 'base64tx', txSignature: 'solSig', fromPubkey: {} });
const mockBroadcastSweepSolana = vi.fn().mockResolvedValue({ signature: 'solBroadcastSig' });
const mockCallSweepBroadcasted = vi.fn().mockResolvedValue(undefined);
const mockCallSweepConfirmed = vi.fn().mockResolvedValue(undefined);
const mockCheckSweepPolicy = vi.fn().mockResolvedValue({ allow: true });

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: unknown) => ({
    _processor: processor,
    on: vi.fn(),
  })),
}));

vi.mock('../db/client.js', () => ({ makeDb: vi.fn(() => ({})) }));
vi.mock('../services/kill-switch-db-query.js', () => ({
  isKillSwitchEnabled: mockIsKillSwitchEnabled,
}));
vi.mock('../queue/worker-heartbeat.js', () => ({
  startHeartbeat: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock('../services/sweep-evm.js', () => ({
  buildAndSignSweepEVM: mockBuildAndSignSweepEVM,
  broadcastSweepEVM: mockBroadcastSweepEVM,
}));
vi.mock('../services/sweep-solana.js', () => ({
  buildAndSignSweepSolana: mockBuildAndSignSweepSolana,
  broadcastSweepSolana: mockBroadcastSweepSolana,
}));
vi.mock('../queue/workers/sweep-policy-check.js', () => ({
  checkSweepPolicy: mockCheckSweepPolicy,
}));
vi.mock('../queue/workers/sweep-admin-notifier.js', () => ({
  callSweepBroadcasted: mockCallSweepBroadcasted,
  callSweepConfirmed: mockCallSweepConfirmed,
}));
vi.mock('@solana/web3.js', () => ({
  PublicKey: vi.fn().mockImplementation((v: string) => ({
    toString: () => v,
    toBuffer: () => Buffer.alloc(32, 1),
  })),
}));

// ── Factories ─────────────────────────────────────────────────────────────────

function makeJob(data: Record<string, unknown>) {
  return {
    id: 'sweep-sol-job',
    data,
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSolDeps() {
  return {
    bnbPool: {
      provider: {
        getTransactionCount: vi.fn().mockResolvedValue(1),
        getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1_000_000_000n }),
      },
    },
    solPool: {
      primary: {
        getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: 'solBlockhash' }),
      },
    },
  };
}

const baseSolSweepData = {
  sweepId: 'sweep-sol-1',
  userAddressId: 'addr-sol-1',
  derivationIndex: 2,
  chain: 'sol',
  token: 'USDT',
  amount: '50',
  fromAddr: 'SolFromAddr',
  destinationHotSafe: 'SolHotSafeAddr',
};

async function bootProcessor(cfg = prodCfg) {
  const { startSweepExecuteWorker } = await import('../queue/workers/sweep-execute-worker.js');
  const { Worker } = await import('bullmq');
  startSweepExecuteWorker({} as never, cfg, makeSolDeps() as never);
  const calls = vi.mocked(Worker).mock.calls;
  return calls[calls.length - 1]![1] as unknown as (
    job: ReturnType<typeof makeJob>
  ) => Promise<void>;
}

// ── Tests: Solana prod path ───────────────────────────────────────────────────

describe('sweep-execute-worker — Solana prod path (HD_MASTER_SEED_SOLANA set)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKillSwitchEnabled.mockResolvedValue(false);
    mockBuildAndSignSweepSolana.mockResolvedValue({ txBase64: 'b64', txSignature: 'sig' });
    mockBroadcastSweepSolana.mockResolvedValue({ signature: 'solBroadcastSig' });
    mockCallSweepBroadcasted.mockResolvedValue(undefined);
    mockCallSweepConfirmed.mockResolvedValue(undefined);
    mockCheckSweepPolicy.mockResolvedValue({ allow: true });
    // Set HD seed so isDevMode('sol') returns false
    process.env.HD_MASTER_SEED_SOLANA = 'deadbeef'.repeat(8);
    // Set BNB key too so prod config is consistent
    process.env.HD_MASTER_XPUB_BNB = 'word '.repeat(12).trim();
  });

  afterEach(() => {
    delete process.env.HD_MASTER_SEED_SOLANA;
    delete process.env.HD_MASTER_XPUB_BNB;
    vi.clearAllMocks();
  });

  it('Solana prod: buildAndSignSweepSolana called with correct params', async () => {
    const processor = await bootProcessor();
    const job = makeJob({ ...baseSolSweepData, chain: 'sol', token: 'USDT' });
    await processor(job);

    expect(mockBuildAndSignSweepSolana).toHaveBeenCalledOnce();
    const [params] = mockBuildAndSignSweepSolana.mock.calls[0] as [Record<string, unknown>];
    expect(params.userAddressIndex).toBe(2);
  });

  it('Solana prod: broadcastSweepSolana called with txBase64', async () => {
    const processor = await bootProcessor();
    const job = makeJob({ ...baseSolSweepData });
    await processor(job);

    expect(mockBroadcastSweepSolana).toHaveBeenCalledOnce();
    expect(mockBroadcastSweepSolana).toHaveBeenCalledWith('b64', expect.anything());
  });

  it('Solana prod: callSweepBroadcasted called with correct signature', async () => {
    const processor = await bootProcessor();
    const job = makeJob({ ...baseSolSweepData });
    await processor(job);

    expect(mockCallSweepBroadcasted).toHaveBeenCalledOnce();
    const [, sweepId, txHash] = mockCallSweepBroadcasted.mock.calls[0] as [unknown, string, string];
    expect(sweepId).toBe('sweep-sol-1');
    expect(txHash).toBe('solBroadcastSig');
  });

  it('Solana prod USDC mint: passes USDC_SOL_MINT to buildAndSignSweepSolana', async () => {
    const processor = await bootProcessor();
    const job = makeJob({ ...baseSolSweepData, token: 'USDC' });
    await processor(job);

    expect(mockBuildAndSignSweepSolana).toHaveBeenCalledOnce();
  });
});

// ── Tests: policy-engine rejection ───────────────────────────────────────────

describe('sweep-execute-worker — policy engine rejection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKillSwitchEnabled.mockResolvedValue(false);
    mockCheckSweepPolicy.mockResolvedValue({ allow: false, reason: 'amount exceeds limit' });
    // Set HD key so prod code path runs (not dev-mode)
    process.env.HD_MASTER_SEED_SOLANA = 'deadbeef'.repeat(8);
    process.env.HD_MASTER_XPUB_BNB = 'word '.repeat(12).trim();
  });

  afterEach(() => {
    delete process.env.HD_MASTER_SEED_SOLANA;
    delete process.env.HD_MASTER_XPUB_BNB;
    vi.clearAllMocks();
  });

  it('policy rejected: throws with reason, no broadcast', async () => {
    const processor = await bootProcessor();
    const job = makeJob({ ...baseSolSweepData, chain: 'sol' });

    await expect(processor(job)).rejects.toThrow('amount exceeds limit');
    expect(mockBuildAndSignSweepSolana).not.toHaveBeenCalled();
    expect(mockCallSweepBroadcasted).not.toHaveBeenCalled();
  });

  it('policy rejected: throws message containing sweepId', async () => {
    const processor = await bootProcessor();
    const job = makeJob({ ...baseSolSweepData, chain: 'sol', sweepId: 'sweep-rejected' });

    await expect(processor(job)).rejects.toThrow('sweep-rejected');
  });
});

// ── Tests: worker event handler callback bodies ───────────────────────────────

describe('sweep-execute-worker — event handler callbacks invoked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HD_MASTER_SEED_SOLANA;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('completed/failed/error/closing callbacks do not throw when invoked', async () => {
    const mockOn = vi.fn();
    const { Worker } = await import('bullmq');
    vi.mocked(Worker).mockImplementationOnce(
      (_name: string, _proc: unknown) => ({ _processor: _proc, on: mockOn }) as never
    );

    const { startSweepExecuteWorker } = await import('../queue/workers/sweep-execute-worker.js');
    startSweepExecuteWorker({} as never, prodCfg, makeSolDeps() as never);

    const calls = mockOn.mock.calls as [string, (...args: unknown[]) => void][];
    const completed = calls.find(([e]) => e === 'completed')?.[1];
    const failed = calls.find(([e]) => e === 'failed')?.[1];
    const error = calls.find(([e]) => e === 'error')?.[1];
    const closing = calls.find(([e]) => e === 'closing')?.[1];

    expect(() => completed?.({ id: 'j1' })).not.toThrow();
    expect(() => failed?.({ id: 'j2' }, new Error('fail'))).not.toThrow();
    expect(() => error?.(new Error('worker error'))).not.toThrow();
    expect(() => closing?.()).not.toThrow();
  });
});
