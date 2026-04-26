// Unit tests for withdrawal-execute-worker inner logic.
// Tests the dev-mode, kill-switch, EVM, Solana paths by extracting the
// BullMQ processor callback directly — no real Redis/RPC/DB.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';

// ── Minimal config fixture ────────────────────────────────────────────────────

const cfg = {
  ADMIN_API_BASE_URL: 'https://admin.test',
  SVC_BEARER_TOKEN: 'svc-token-test-1234567',
  DATABASE_URL: 'postgres://fake',
} as unknown as AppConfig;

// ── Mock heavy dependencies before any imports ────────────────────────────────

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: unknown) => ({
    _processor: processor,
    on: vi.fn(),
  })),
}));

vi.mock('../db/client.js', () => ({
  makeDb: vi.fn(() => ({ execute: vi.fn().mockResolvedValue([{ enabled: false }]) })),
}));

vi.mock('../services/kill-switch-db-query.js', () => ({
  isKillSwitchEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('../queue/worker-heartbeat.js', () => ({
  startHeartbeat: vi.fn().mockReturnValue(vi.fn()),
}));

const mockWait = vi.fn().mockResolvedValue({ hash: '0xprodHash', blockNumber: 100 });
const mockExecTransaction = vi.fn().mockResolvedValue({ wait: mockWait });
const mockContractFn = vi.fn().mockImplementation(() => ({ wait: mockWait }));

vi.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: vi.fn(() => ({})),
    Wallet: vi.fn(() => ({ address: '0xExecutor' })),
    Contract: vi.fn(() => ({
      execTransaction: mockExecTransaction,
    })),
    parseUnits: vi.fn().mockReturnValue(BigInt(1_000_000)),
    ZeroAddress: '0x0000000000000000000000000000000000000000',
  },
  Interface: vi.fn(() => ({
    encodeFunctionData: vi.fn().mockReturnValue('0xencoded'),
  })),
}));

const mockSendTransaction = vi.fn().mockResolvedValue('solTxSig1111');
const mockConfirmTransaction = vi.fn().mockResolvedValue({ value: {} });
const mockGetLatestBlockhash = vi.fn().mockResolvedValue({ blockhash: 'fakeHash' });
const mockSolanaConnection = {
  sendTransaction: mockSendTransaction,
  confirmTransaction: mockConfirmTransaction,
  getLatestBlockhash: mockGetLatestBlockhash,
};

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(() => mockSolanaConnection),
  Keypair: { fromSecretKey: vi.fn().mockReturnValue({ publicKey: { toBase58: () => 'fakePub' } }) },
  PublicKey: vi
    .fn()
    .mockImplementation((v: string) => ({ toString: () => v, toBuffer: () => Buffer.alloc(32) })),
  TransactionMessage: vi.fn(() => ({ compileToV0Message: vi.fn().mockReturnValue('msg') })),
  VersionedTransaction: vi.fn(() => ({ sign: vi.fn() })),
  SystemProgram: { programId: 'SystemProgram' },
}));

const mockMultisigFromAddress = vi.fn().mockResolvedValue({ transactionIndex: 1n });
const mockVaultExecute = vi.fn().mockResolvedValue({ instruction: {}, lookupTableAccounts: [] });
const mockConfigExecute = vi.fn().mockReturnValue({});

vi.mock('@sqds/multisig', () => ({
  accounts: { Multisig: { fromAccountAddress: mockMultisigFromAddress } },
  instructions: {
    vaultTransactionExecute: mockVaultExecute,
    configTransactionExecute: mockConfigExecute,
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(data: Record<string, unknown>) {
  return {
    id: 'job-1',
    data,
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  };
}

function makeResponse(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('withdrawal-execute-worker — dev-mode path', () => {
  let processor: (job: ReturnType<typeof makeJob>) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = 'true';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200)));

    const { startWithdrawalExecuteWorker } = await import(
      '../queue/workers/withdrawal-execute-worker.js'
    );
    const { Worker } = await import('bullmq');
    startWithdrawalExecuteWorker({} as never, cfg);
    // Extract processor from last Worker construction
    const calls = vi.mocked(Worker).mock.calls;
    processor = calls[calls.length - 1]?.[1] as unknown as typeof processor;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('dev mode: generates synthetic tx hash (no RPC) and calls broadcasted + confirmed', async () => {
    const job = makeJob({
      withdrawalId: 'wd-1',
      chain: 'bnb',
      token: 'USDT',
      amount: '10',
      destinationAddr: '0xDest',
    });
    await processor(job);

    const calls = vi.mocked(fetch).mock.calls as [string, RequestInit][];
    const broadcastedCall = calls.find(([url]) => url.includes('/broadcasted'));
    const confirmedCall = calls.find(([url]) => url.includes('/confirmed'));

    expect(broadcastedCall).toBeDefined();
    expect(confirmedCall).toBeDefined();

    // txHash in body should start with 0x
    const broadcastBody = JSON.parse(broadcastedCall?.[1].body as string) as { txHash: string };
    expect(broadcastBody.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('dev mode: callBroadcasted called before callConfirmed', async () => {
    const callOrder: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/broadcasted')) callOrder.push('broadcasted');
        if (url.includes('/confirmed')) callOrder.push('confirmed');
        return Promise.resolve(makeResponse(200));
      })
    );

    const job = makeJob({
      withdrawalId: 'wd-order',
      chain: 'sol',
      token: 'USDC',
      amount: '5',
      destinationAddr: 'SolAddr',
    });
    await processor(job);

    expect(callOrder).toEqual(['broadcasted', 'confirmed']);
  });
});

describe('withdrawal-execute-worker — kill-switch', () => {
  let processor: (job: ReturnType<typeof makeJob>) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = 'false';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200)));

    const { isKillSwitchEnabled } = await import('../services/kill-switch-db-query.js');
    vi.mocked(isKillSwitchEnabled).mockResolvedValue(true);

    const { startWithdrawalExecuteWorker } = await import(
      '../queue/workers/withdrawal-execute-worker.js'
    );
    const { Worker } = await import('bullmq');
    startWithdrawalExecuteWorker({} as never, cfg);
    const calls = vi.mocked(Worker).mock.calls;
    processor = calls[calls.length - 1]?.[1] as unknown as typeof processor;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('kill-switch: job moved to delayed 30s, no broadcast', async () => {
    const job = makeJob({
      withdrawalId: 'wd-ks',
      chain: 'bnb',
      token: 'USDT',
      amount: '10',
      destinationAddr: '0xDest',
    });
    await processor(job);

    expect(job.moveToDelayed).toHaveBeenCalledOnce();
    const delayArg = (job.moveToDelayed as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as number;
    expect(delayArg).toBeGreaterThanOrEqual(Date.now() + 28_000);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe('withdrawal-execute-worker — prod EVM error cases', () => {
  // Each test resets modules so it gets a fresh Worker constructor mock
  // and a fresh isKillSwitchEnabled mock (defaults to false = off).
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = undefined; // not dev mode
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('unknown chain: throws error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, { signatures: [] })));

    // Re-mock kill-switch as off for this test
    vi.doMock('../services/kill-switch-db-query.js', () => ({
      isKillSwitchEnabled: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock('bullmq', () => ({
      Worker: vi.fn().mockImplementation((_name: string, processor: unknown) => ({
        _processor: processor,
        on: vi.fn(),
      })),
    }));

    const { startWithdrawalExecuteWorker } = await import(
      '../queue/workers/withdrawal-execute-worker.js'
    );
    const { Worker } = await import('bullmq');
    startWithdrawalExecuteWorker({} as never, cfg);
    const calls = vi.mocked(Worker).mock.calls;
    const processor = calls[calls.length - 1]?.[1] as unknown as (
      job: ReturnType<typeof makeJob>
    ) => Promise<void>;

    const job = makeJob({
      withdrawalId: 'wd-bad',
      chain: 'ltc',
      token: 'USDT',
      amount: '1',
      destinationAddr: '0xDest',
    });
    await expect(processor(job)).rejects.toThrow('Unknown chain');
  });

  it('missing SAFE_ADDRESS in prod EVM: throws FATAL', async () => {
    process.env.SAFE_ADDRESS = undefined;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          makeResponse(200, { signatures: [{ signer: '0xA', signature: '0xsig' }] })
        )
    );

    vi.doMock('../services/kill-switch-db-query.js', () => ({
      isKillSwitchEnabled: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock('bullmq', () => ({
      Worker: vi.fn().mockImplementation((_name: string, processor: unknown) => ({
        _processor: processor,
        on: vi.fn(),
      })),
    }));

    const { startWithdrawalExecuteWorker } = await import(
      '../queue/workers/withdrawal-execute-worker.js'
    );
    const { Worker } = await import('bullmq');
    startWithdrawalExecuteWorker({} as never, cfg);
    const calls = vi.mocked(Worker).mock.calls;
    const processor = calls[calls.length - 1]?.[1] as unknown as (
      job: ReturnType<typeof makeJob>
    ) => Promise<void>;

    const job = makeJob({
      withdrawalId: 'wd-nosafe',
      chain: 'bnb',
      token: 'USDT',
      amount: '1',
      destinationAddr: '0xDest',
    });
    await expect(processor(job)).rejects.toThrow('SAFE_ADDRESS');
  });
});
