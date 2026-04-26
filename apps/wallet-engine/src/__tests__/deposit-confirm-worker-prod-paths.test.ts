// Tests for deposit-confirm-worker.ts production (non-dev) paths.
// Covers: BNB/Solana confirmation polling, RPC error → rethrow, not-confirmed throw,
// confirmed → credit, and worker event-handler callback invocation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';

// ── Top-level mocks (hoisted) ─────────────────────────────────────────────────

const mockCreditDeposit = vi.fn();
const mockCheckBnbConfirmations = vi.fn();
const mockCheckSolanaConfirmations = vi.fn();

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

// Mock checkBnbConfirmations and checkSolanaConfirmations as module-level re-exports
// by mocking the entire module — the worker imports from the same file, so we mock
// the functions via a manual mock that the worker's internal module will use.
// NOTE: we cannot mock the worker's own internal functions directly.
// Instead we mock ethers and @solana/web3.js which those functions depend on.

const mockGetTransactionReceipt = vi.fn();
const mockGetBlockNumber = vi.fn();
const mockGetSignatureStatuses = vi.fn();
const mockGetTransaction = vi.fn();

vi.mock('ethers', () => ({
  JsonRpcProvider: vi.fn().mockImplementation(() => ({
    getTransactionReceipt: mockGetTransactionReceipt,
    getBlockNumber: mockGetBlockNumber,
    destroy: vi.fn(),
  })),
}));

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn().mockImplementation(() => ({
    getSignatureStatuses: mockGetSignatureStatuses,
    getTransaction: mockGetTransaction,
  })),
}));

// ── Config ────────────────────────────────────────────────────────────────────

const prodCfg = {
  ADMIN_API_BASE_URL: 'https://admin.test',
  SVC_BEARER_TOKEN: 'svc-token-test-1234567',
  RPC_BNB_PRIMARY: 'https://fake-bnb-rpc',
  RPC_SOLANA_PRIMARY: 'https://fake-solana-rpc',
  WATCHER_ENABLED: true,
} as unknown as AppConfig;

// ── Factories ─────────────────────────────────────────────────────────────────

function makeJob(data: Record<string, unknown>) {
  return { id: 'dc-job-1', data };
}

async function bootProcessor(cfg: AppConfig) {
  const { startDepositConfirmWorker } = await import('../queue/workers/deposit-confirm-worker.js');
  const { Worker } = await import('bullmq');
  startDepositConfirmWorker({} as never, cfg);
  const calls = vi.mocked(Worker).mock.calls;
  return calls[calls.length - 1]?.[1] as unknown as (
    job: ReturnType<typeof makeJob>
  ) => Promise<void>;
}

// ── Tests: prod BNB RPC paths ─────────────────────────────────────────────────

describe('deposit-confirm-worker — prod BNB confirmation (WATCHER_ENABLED=true)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {});

  it('BNB confirmed: credits deposit after 12+ confirmations', async () => {
    // receipt at block 100; currentBlock 113 → 13 confirmations ≥ 12
    mockGetTransactionReceipt.mockResolvedValue({ blockNumber: 100 });
    mockGetBlockNumber.mockResolvedValue(113);
    mockCreditDeposit.mockResolvedValue({ success: true });

    const processor = await bootProcessor(prodCfg);
    await processor(makeJob({ depositId: 'dep-bnb-ok', txHash: '0xhash', chain: 'bnb' }));

    expect(mockCreditDeposit).toHaveBeenCalledOnce();
  });

  it('BNB not confirmed: throws rescheduling error', async () => {
    // Only 5 confirmations — not enough
    mockGetTransactionReceipt.mockResolvedValue({ blockNumber: 100 });
    mockGetBlockNumber.mockResolvedValue(105);

    const processor = await bootProcessor(prodCfg);
    await expect(
      processor(makeJob({ depositId: 'dep-bnb-wait', txHash: '0xhash', chain: 'bnb' }))
    ).rejects.toThrow('not yet confirmed');
  });

  it('BNB receipt null: not confirmed, throws rescheduling error', async () => {
    mockGetTransactionReceipt.mockResolvedValue(null);
    mockGetBlockNumber.mockResolvedValue(200);

    const processor = await bootProcessor(prodCfg);
    await expect(
      processor(makeJob({ depositId: 'dep-bnb-null', txHash: '0xhash', chain: 'bnb' }))
    ).rejects.toThrow('not yet confirmed');
  });

  it('BNB RPC error: wraps and rethrows for BullMQ retry', async () => {
    mockGetTransactionReceipt.mockRejectedValue(new Error('BNB RPC down'));

    const processor = await bootProcessor(prodCfg);
    await expect(
      processor(makeJob({ depositId: 'dep-bnb-rpc', txHash: '0xhash', chain: 'bnb' }))
    ).rejects.toThrow('RPC confirmation check failed');
  });
});

// ── Tests: prod Solana RPC paths ──────────────────────────────────────────────

describe('deposit-confirm-worker — prod Solana confirmation (WATCHER_ENABLED=true)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {});

  it('Solana finalized: credits deposit immediately', async () => {
    mockGetSignatureStatuses.mockResolvedValue({
      value: [{ confirmationStatus: 'finalized', confirmations: null, err: null }],
    });
    mockCreditDeposit.mockResolvedValue({ success: true });

    const processor = await bootProcessor(prodCfg);
    await processor(makeJob({ depositId: 'dep-sol-ok', txHash: 'solSig111', chain: 'sol' }));

    expect(mockCreditDeposit).toHaveBeenCalledOnce();
  });

  it('Solana insufficient confirmations: throws rescheduling error', async () => {
    mockGetSignatureStatuses.mockResolvedValue({
      value: [{ confirmationStatus: 'confirmed', confirmations: 5, err: null }],
    });

    const processor = await bootProcessor(prodCfg);
    await expect(
      processor(makeJob({ depositId: 'dep-sol-wait', txHash: 'solSig222', chain: 'sol' }))
    ).rejects.toThrow('not yet confirmed');
  });

  it('Solana RPC error: wraps and rethrows for BullMQ retry', async () => {
    mockGetSignatureStatuses.mockRejectedValue(new Error('Solana RPC down'));

    const processor = await bootProcessor(prodCfg);
    await expect(
      processor(makeJob({ depositId: 'dep-sol-rpc', txHash: 'solSig333', chain: 'sol' }))
    ).rejects.toThrow('RPC confirmation check failed');
  });

  it('Solana with 32+ confirmations (not finalized): credits deposit', async () => {
    mockGetSignatureStatuses.mockResolvedValue({
      value: [{ confirmationStatus: 'confirmed', confirmations: 35, err: null }],
    });
    mockCreditDeposit.mockResolvedValue({ success: true });

    const processor = await bootProcessor(prodCfg);
    await processor(makeJob({ depositId: 'dep-sol-32', txHash: 'solSig444', chain: 'sol' }));
    expect(mockCreditDeposit).toHaveBeenCalledOnce();
  });
});

// ── Tests: worker event handler callbacks ─────────────────────────────────────

describe('deposit-confirm-worker — event handler callbacks invoked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('on(completed) callback logs without throwing', async () => {
    const mockOn = vi.fn();
    const { Worker } = await import('bullmq');
    vi.mocked(Worker).mockImplementationOnce(
      (_name: string, _proc: unknown) =>
        ({
          _processor: _proc,
          on: mockOn,
        }) as never
    );

    const { startDepositConfirmWorker } = await import(
      '../queue/workers/deposit-confirm-worker.js'
    );
    startDepositConfirmWorker({} as never, prodCfg);

    // Invoke each registered callback
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
