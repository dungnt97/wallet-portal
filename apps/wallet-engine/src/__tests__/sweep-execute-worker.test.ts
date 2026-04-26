// Unit tests for sweep-execute-worker inner logic.
// Tests dev-mode synthetic hash, kill-switch delay, and admin-api side effects.
// No real Redis / RPC / DB connections.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';

// ── Config fixture ────────────────────────────────────────────────────────────

const cfg = {
  ADMIN_API_BASE_URL: 'https://admin.test',
  SVC_BEARER_TOKEN: 'svc-token-test-1234567',
  DATABASE_URL: 'postgres://fake',
  USDT_BNB_ADDRESS: '0xUSDT',
  USDC_BNB_ADDRESS: '0xUSDC',
  USDT_SOL_MINT: 'USDTmint',
  USDC_SOL_MINT: 'USDCmint',
  POLICY_ENGINE_BASE_URL: 'http://localhost:3003',
} as unknown as AppConfig;

// ── Module-level mock spies (not wiped by vi.clearAllMocks) ───────────────────

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

// ── Module mocks (hoisted before imports) ─────────────────────────────────────

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

vi.mock('../services/sweep-evm.js', () => ({
  buildAndSignSweepEVM: mockBuildAndSignSweepEVM,
  broadcastSweepEVM: mockBroadcastSweepEVM,
}));

vi.mock('../services/sweep-solana.js', () => ({
  buildAndSignSweepSolana: mockBuildAndSignSweepSolana,
  broadcastSweepSolana: mockBroadcastSweepSolana,
}));

vi.mock('../queue/workers/sweep-policy-check.js', () => ({
  checkSweepPolicy: vi.fn().mockResolvedValue({ allow: true }),
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
    id: 'sweep-job-1',
    data,
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDeps() {
  return {
    bnbPool: {
      provider: {
        getTransactionCount: vi.fn().mockResolvedValue(5),
        getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1_000_000_000n, maxFeePerGas: null }),
      },
    },
    solPool: {
      primary: {
        getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: 'blockHash123' }),
      },
    },
  };
}

const baseSweepData = {
  sweepId: 'sweep-1',
  userAddressId: 'addr-1',
  derivationIndex: 0,
  chain: 'bnb',
  token: 'USDT',
  amount: '100',
  fromAddr: '0xFromAddr',
  destinationHotSafe: '0xHotSafe',
};

// ── Helper: boot worker + extract processor ───────────────────────────────────

async function bootProcessor() {
  const { startSweepExecuteWorker } = await import('../queue/workers/sweep-execute-worker.js');
  const { Worker } = await import('bullmq');
  startSweepExecuteWorker({} as never, cfg, makeDeps() as never);
  const calls = vi.mocked(Worker).mock.calls;
  return calls[calls.length - 1]?.[1] as unknown as (
    job: ReturnType<typeof makeJob>
  ) => Promise<void>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sweep-execute-worker — dev-mode (no HD keys set)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKillSwitchEnabled.mockResolvedValue(false);
    mockCallSweepBroadcasted.mockResolvedValue(undefined);
    mockCallSweepConfirmed.mockResolvedValue(undefined);
    // No HD key → dev mode active
    process.env.HD_MASTER_XPUB_BNB = '';
    process.env.HD_MASTER_SEED_SOLANA = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('dev mode BNB: callSweepBroadcasted and callSweepConfirmed are called', async () => {
    const processor = await bootProcessor();
    const job = makeJob({ ...baseSweepData, chain: 'bnb' });
    await processor(job);

    expect(mockCallSweepBroadcasted).toHaveBeenCalledOnce();
    expect(mockCallSweepConfirmed).toHaveBeenCalledOnce();
  });

  it('dev mode SOL: callSweepBroadcasted and callSweepConfirmed are called', async () => {
    const processor = await bootProcessor();
    const job = makeJob({ ...baseSweepData, chain: 'sol' });
    await processor(job);

    expect(mockCallSweepBroadcasted).toHaveBeenCalledOnce();
    expect(mockCallSweepConfirmed).toHaveBeenCalledOnce();
  });

  it('dev mode: buildAndSignSweepEVM is NOT called (synthetic path)', async () => {
    const processor = await bootProcessor();
    const job = makeJob({ ...baseSweepData, chain: 'bnb' });
    await processor(job);

    expect(mockBuildAndSignSweepEVM).not.toHaveBeenCalled();
  });
});

describe('sweep-execute-worker — kill-switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKillSwitchEnabled.mockResolvedValue(true); // ON
    process.env.HD_MASTER_XPUB_BNB = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('kill-switch ON: job moved to 30s delay, no broadcast', async () => {
    const processor = await bootProcessor();
    const job = makeJob(baseSweepData);
    await processor(job);

    expect(job.moveToDelayed).toHaveBeenCalledOnce();
    const delayArg = (job.moveToDelayed as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as number;
    expect(delayArg - Date.now()).toBeGreaterThanOrEqual(28_000);
    expect(mockCallSweepBroadcasted).not.toHaveBeenCalled();
  });
});

describe('sweep-execute-worker — prod EVM path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKillSwitchEnabled.mockResolvedValue(false);
    mockBuildAndSignSweepEVM.mockResolvedValue({
      txHex: '0xhex',
      txHash: '0xevmHash',
      fromAddress: '0xFrom',
    });
    mockBroadcastSweepEVM.mockResolvedValue({ txHash: '0xevmBroadcastHash' });
    mockCallSweepBroadcasted.mockResolvedValue(undefined);
    mockCallSweepConfirmed.mockResolvedValue(undefined);
    // Set HD key so sweep-execute-worker's isDevMode('bnb') returns false
    process.env.HD_MASTER_XPUB_BNB = 'word '.repeat(12).trim();
  });

  afterEach(() => {
    process.env.HD_MASTER_XPUB_BNB = '';
    vi.clearAllMocks();
  });

  it('prod EVM: buildAndSignSweepEVM and broadcastSweepEVM called', async () => {
    const processor = await bootProcessor();
    const job = makeJob({ ...baseSweepData, chain: 'bnb' });
    await processor(job);

    expect(mockBuildAndSignSweepEVM).toHaveBeenCalledOnce();
    expect(mockBroadcastSweepEVM).toHaveBeenCalledOnce();
  });

  it('prod EVM: callSweepBroadcasted called with sweepId and txHash from broadcastSweepEVM', async () => {
    const processor = await bootProcessor();
    const job = makeJob({ ...baseSweepData, chain: 'bnb' });
    await processor(job);

    expect(mockCallSweepBroadcasted).toHaveBeenCalledOnce();
    const [, sweepId, txHash] = mockCallSweepBroadcasted.mock.calls[0] as [unknown, string, string];
    expect(sweepId).toBe('sweep-1');
    expect(txHash).toBe('0xevmBroadcastHash');
  });
});
