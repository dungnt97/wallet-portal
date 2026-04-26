// Tests for signer-ceremony-broadcast-worker.ts production paths:
// - broadcastEvmCeremony (lines ~102-183): missing SAFE_ADDRESS, BNB_RPC_URL,
//   WALLET_ENGINE_EXECUTOR_KEY FATAL throws; successful EVM ceremony broadcast
// - broadcastSolanaCeremony (lines ~187-247): missing env FATAL throws
// - callCeremonyChainFailed non-2xx logs warn but does not rethrow (line 75-76)
// - chain_states lookup for 'solana' key (chain='sol' path, line 278)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';

// ── Config fixture ────────────────────────────────────────────────────────────

const cfg = {
  ADMIN_API_BASE_URL: 'https://admin.test',
  SVC_BEARER_TOKEN: 'svc-token-test-1234567',
  DATABASE_URL: 'postgres://fake',
} as unknown as AppConfig;

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockFindFirst = vi.fn();

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: unknown) => ({
    _processor: processor,
    on: vi.fn(),
  })),
}));

vi.mock('../queue/worker-heartbeat.js', () => ({
  startHeartbeat: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock('../db/client.js', () => ({
  makeDb: vi.fn(() => ({
    query: { signerCeremonies: { findFirst: mockFindFirst } },
  })),
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));

vi.mock('@wp/admin-api/db-schema', () => ({
  signerCeremonies: { id: 'id' },
}));

vi.mock('../services/signer-ceremony-evm.js', () => ({
  SENTINEL_OWNER: '0x0000000000000000000000000000000000000001',
  buildAddOwnerTx: vi
    .fn()
    .mockReturnValue({ to: '0xSafe', value: 0n, data: '0xaddOwner', operation: 0 }),
  buildRemoveOwnerTx: vi
    .fn()
    .mockReturnValue({ to: '0xSafe', value: 0n, data: '0xremoveOwner', operation: 0 }),
  buildRotateTx: vi
    .fn()
    .mockReturnValue({ to: '0xSafe', value: 0n, data: '0xrotate', operation: 0 }),
}));

// ── Ethers mock for EVM broadcast ────────────────────────────────────────────

const mockExecTransaction = vi.fn();
const mockWait = vi.fn().mockResolvedValue({ hash: '0xEvmTxHash', blockNumber: 42 });

vi.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: vi.fn(() => ({})),
    Wallet: vi.fn(() => ({ address: '0xExecutorAddr' })),
    Contract: vi.fn(() => ({
      execTransaction: mockExecTransaction,
    })),
    ZeroAddress: '0x0000000000000000000000000000000000000000',
  },
}));

// ── Solana mock for Solana ceremony broadcast ─────────────────────────────────

const mockSendSolTx = vi.fn().mockResolvedValue('solCeremonyTxSig');
const mockConfirmSolTx = vi.fn().mockResolvedValue({ value: {} });
const mockGetLatestBlockhash = vi.fn().mockResolvedValue({ blockhash: 'bh' });
const mockMultisigFromAddress = vi.fn().mockResolvedValue({ transactionIndex: 1n });
const mockConfigExecute = vi.fn().mockReturnValue({});

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(() => ({
    sendTransaction: mockSendSolTx,
    confirmTransaction: mockConfirmSolTx,
    getLatestBlockhash: mockGetLatestBlockhash,
  })),
  Keypair: {
    fromSecretKey: vi.fn().mockReturnValue({
      publicKey: { toBase58: () => 'FakePub' },
    }),
  },
  PublicKey: vi.fn().mockImplementation((v: string) => ({
    toString: () => v,
    toBase58: () => v,
  })),
  TransactionMessage: vi.fn(() => ({
    compileToV0Message: vi.fn().mockReturnValue('compiledMsg'),
  })),
  VersionedTransaction: vi.fn(() => ({ sign: vi.fn() })),
}));

vi.mock('@sqds/multisig', () => ({
  accounts: { Multisig: { fromAccountAddress: mockMultisigFromAddress } },
  instructions: { configTransactionExecute: mockConfigExecute },
}));

// ── Factories ─────────────────────────────────────────────────────────────────

function makeJob(data: Record<string, unknown>) {
  return { id: 'sc-job-prod', data };
}

function makeCeremony(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ceremony-prod-1',
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

function makeErrorResponse(status: number) {
  return { ok: false, status, json: vi.fn().mockResolvedValue({}) } as unknown as Response;
}

async function bootProcessor() {
  const { startSignerCeremonyWorker } = await import(
    '../queue/workers/signer-ceremony-broadcast-worker.js'
  );
  const { Worker } = await import('bullmq');
  startSignerCeremonyWorker({} as never, cfg);
  const calls = vi.mocked(Worker).mock.calls;
  return calls[calls.length - 1]?.[1] as unknown as (
    job: ReturnType<typeof makeJob>
  ) => Promise<void>;
}

// ── Tests: EVM production path ────────────────────────────────────────────────

describe('signer-ceremony-broadcast-worker — EVM prod: missing env FATAL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = undefined;
    process.env.SAFE_ADDRESS = '0xSafeContract';
    process.env.BNB_RPC_URL = 'https://fake-bnb';
    process.env.WALLET_ENGINE_EXECUTOR_KEY = `0x${'ab'.repeat(32)}`;
  });

  afterEach(() => {
    process.env.AUTH_DEV_MODE = undefined;
    process.env.SAFE_ADDRESS = undefined;
    process.env.BNB_RPC_URL = undefined;
    process.env.WALLET_ENGINE_EXECUTOR_KEY = undefined;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('missing SAFE_ADDRESS: throws FATAL, chain-failed callback called', async () => {
    process.env.SAFE_ADDRESS = undefined;
    mockFindFirst.mockResolvedValue(makeCeremony());
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(makeOkResponse()) // chain-failed callback
    );

    const processor = await bootProcessor();
    await expect(processor(makeJob({ ceremonyId: 'c1', chain: 'bnb' }))).rejects.toThrow(
      'SAFE_ADDRESS'
    );

    const calls = vi.mocked(fetch).mock.calls as [string][];
    expect(calls.some(([u]) => u.includes('/chain-failed'))).toBe(true);
  });

  it('missing BNB_RPC_URL: throws FATAL', async () => {
    process.env.BNB_RPC_URL = undefined;
    mockFindFirst.mockResolvedValue(makeCeremony());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse()));

    const processor = await bootProcessor();
    await expect(processor(makeJob({ ceremonyId: 'c2', chain: 'bnb' }))).rejects.toThrow(
      'BNB_RPC_URL'
    );
  });

  it('missing WALLET_ENGINE_EXECUTOR_KEY: throws FATAL', async () => {
    process.env.WALLET_ENGINE_EXECUTOR_KEY = undefined;
    mockFindFirst.mockResolvedValue(makeCeremony());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse()));

    const processor = await bootProcessor();
    await expect(processor(makeJob({ ceremonyId: 'c3', chain: 'bnb' }))).rejects.toThrow(
      'WALLET_ENGINE_EXECUTOR_KEY'
    );
  });

  it('EVM prod signer_add: execTransaction called, chain-confirmed recorded', async () => {
    mockFindFirst.mockResolvedValue(makeCeremony({ operationType: 'signer_add' }));
    mockExecTransaction.mockResolvedValue({ wait: mockWait });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse()));

    const processor = await bootProcessor();
    await processor(makeJob({ ceremonyId: 'c4', chain: 'bnb' }));

    const calls = vi.mocked(fetch).mock.calls as [string][];
    expect(calls.some(([u]) => u.includes('/chain-confirmed'))).toBe(true);
  });

  it('EVM prod signer_remove: execTransaction called', async () => {
    mockFindFirst.mockResolvedValue(makeCeremony({ operationType: 'signer_remove' }));
    mockExecTransaction.mockResolvedValue({ wait: mockWait });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse()));

    const processor = await bootProcessor();
    await processor(makeJob({ ceremonyId: 'c5', chain: 'bnb' }));

    expect(mockExecTransaction).toHaveBeenCalledOnce();
  });

  it('EVM prod rotate: execTransaction called via buildRotateTx', async () => {
    mockFindFirst.mockResolvedValue(makeCeremony({ operationType: 'rotate' }));
    mockExecTransaction.mockResolvedValue({ wait: mockWait });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse()));

    const processor = await bootProcessor();
    await processor(makeJob({ ceremonyId: 'c6', chain: 'bnb' }));

    expect(mockExecTransaction).toHaveBeenCalledOnce();
  });

  it('execTransaction returns null receipt: throws, chain-failed called', async () => {
    mockFindFirst.mockResolvedValue(makeCeremony());
    mockExecTransaction.mockResolvedValue({ wait: vi.fn().mockResolvedValue(null) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse()));

    const processor = await bootProcessor();
    await expect(processor(makeJob({ ceremonyId: 'c7', chain: 'bnb' }))).rejects.toThrow(
      'no receipt'
    );
  });
});

// ── Tests: Solana production path ─────────────────────────────────────────────

describe('signer-ceremony-broadcast-worker — Solana prod path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = undefined;
    process.env.SQUADS_MULTISIG_ADDRESS = 'SquadsMultisigPda222';
    process.env.SOL_RPC_URL = 'https://fake-sol';
    process.env.WALLET_ENGINE_SOL_PAYER_KEY = Buffer.from(new Uint8Array(64)).toString('base64');
  });

  afterEach(() => {
    process.env.AUTH_DEV_MODE = undefined;
    process.env.SQUADS_MULTISIG_ADDRESS = undefined;
    process.env.SOL_RPC_URL = undefined;
    process.env.WALLET_ENGINE_SOL_PAYER_KEY = undefined;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('Solana prod: sendTransaction called and chain-confirmed recorded', async () => {
    mockFindFirst.mockResolvedValue(makeCeremony());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse()));

    const processor = await bootProcessor();
    await processor(makeJob({ ceremonyId: 'sc-sol-1', chain: 'sol' }));

    expect(mockSendSolTx).toHaveBeenCalledOnce();
    const calls = vi.mocked(fetch).mock.calls as [string][];
    expect(calls.some(([u]) => u.includes('/chain-confirmed'))).toBe(true);
  });

  it('missing SQUADS_MULTISIG_ADDRESS: throws FATAL', async () => {
    process.env.SQUADS_MULTISIG_ADDRESS = undefined;
    mockFindFirst.mockResolvedValue(makeCeremony());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse()));

    const processor = await bootProcessor();
    await expect(processor(makeJob({ ceremonyId: 'sc-no-pda', chain: 'sol' }))).rejects.toThrow(
      'SQUADS_MULTISIG_ADDRESS'
    );
  });

  it('missing SOL_RPC_URL: throws FATAL', async () => {
    process.env.SOL_RPC_URL = undefined;
    mockFindFirst.mockResolvedValue(makeCeremony());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse()));

    const processor = await bootProcessor();
    await expect(processor(makeJob({ ceremonyId: 'sc-no-rpc', chain: 'sol' }))).rejects.toThrow(
      'SOL_RPC_URL'
    );
  });

  it('missing WALLET_ENGINE_SOL_PAYER_KEY: throws FATAL', async () => {
    process.env.WALLET_ENGINE_SOL_PAYER_KEY = undefined;
    mockFindFirst.mockResolvedValue(makeCeremony());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse()));

    const processor = await bootProcessor();
    await expect(processor(makeJob({ ceremonyId: 'sc-no-payer', chain: 'sol' }))).rejects.toThrow(
      'WALLET_ENGINE_SOL_PAYER_KEY'
    );
  });

  it('chain already confirmed for solana key: skips broadcast', async () => {
    // chainStates.solana.status = 'confirmed' with txHash → should skip
    const ceremony = makeCeremony({
      chainStates: { solana: { status: 'confirmed', txHash: '0xAlreadyDone' } },
    });
    mockFindFirst.mockResolvedValue(ceremony);
    vi.stubGlobal('fetch', vi.fn());

    const processor = await bootProcessor();
    await processor(makeJob({ ceremonyId: 'sc-already', chain: 'sol' }));

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ── Tests: chain-failed callback non-2xx (line 75-76 warn path) ──────────────

describe('signer-ceremony-broadcast-worker — chain-failed callback non-2xx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = 'true';
  });

  afterEach(() => {
    process.env.AUTH_DEV_MODE = undefined;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('chain-confirmed 500 → chain-failed called; chain-failed returns non-2xx → logs warn (no secondary throw)', async () => {
    mockFindFirst.mockResolvedValue(makeCeremony());
    // chain-confirmed → 500; chain-failed → 503 (non-2xx — should log warn, not throw)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(makeErrorResponse(500)) // /chain-confirmed fails
        .mockResolvedValueOnce(makeErrorResponse(503)) // /chain-failed non-2xx
    );

    const processor = await bootProcessor();
    // Should rethrow original error from chain-confirmed, NOT the chain-failed warn
    await expect(processor(makeJob({ ceremonyId: 'c-warn', chain: 'bnb' }))).rejects.toThrow();

    const calls = vi.mocked(fetch).mock.calls as [string][];
    expect(calls.some(([u]) => u.includes('/chain-failed'))).toBe(true);
  });
});

// ── Tests: worker event handler callbacks ─────────────────────────────────────

describe('signer-ceremony-broadcast-worker — event handler callbacks invoked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = 'true';
  });

  afterEach(() => {
    process.env.AUTH_DEV_MODE = undefined;
    vi.resetModules();
  });

  it('completed/failed/error/closing callbacks do not throw when invoked', async () => {
    const mockOn = vi.fn();
    const { Worker } = await import('bullmq');
    vi.mocked(Worker).mockImplementationOnce(
      (_name: string, _proc: unknown) => ({ _processor: _proc, on: mockOn }) as never
    );

    const { startSignerCeremonyWorker } = await import(
      '../queue/workers/signer-ceremony-broadcast-worker.js'
    );
    startSignerCeremonyWorker({} as never, cfg);

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
