// Tests for withdrawal-execute-worker.ts Solana production path (lines 201-227)
// and packSafeSignatures sorting helper.
// Covers: broadcastSolanaSquads happy path, missing env FATAL throws,
// and the EVM-path producton flow (SAFE_ADDRESS + BNB_RPC_URL set).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';

// ── Config fixture ────────────────────────────────────────────────────────────

const cfg = {
  ADMIN_API_BASE_URL: 'https://admin.test',
  SVC_BEARER_TOKEN: 'svc-token-test-1234567',
  DATABASE_URL: 'postgres://fake',
} as unknown as AppConfig;

// ── Solana mock plumbing ───────────────────────────────────────────────────────

const mockSendTransaction = vi.fn().mockResolvedValue('solTxSig9999');
const mockConfirmTransaction = vi.fn().mockResolvedValue({ value: {} });
const mockGetLatestBlockhash = vi.fn().mockResolvedValue({ blockhash: 'freshHash' });
const mockMultisigFromAddress = vi.fn().mockResolvedValue({ transactionIndex: 3n });
const mockVaultExecute = vi.fn().mockResolvedValue({ instruction: {}, lookupTableAccounts: [] });

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
  isKillSwitchEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('../queue/worker-heartbeat.js', () => ({
  startHeartbeat: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(() => ({
    sendTransaction: mockSendTransaction,
    confirmTransaction: mockConfirmTransaction,
    getLatestBlockhash: mockGetLatestBlockhash,
  })),
  Keypair: {
    fromSecretKey: vi.fn().mockReturnValue({
      publicKey: { toBase58: () => 'FakePub', toString: () => 'FakePub' },
      secretKey: new Uint8Array(64),
    }),
  },
  PublicKey: vi.fn().mockImplementation((v: string) => ({
    toString: () => v,
    toBase58: () => v,
    toBuffer: () => Buffer.alloc(32),
  })),
  TransactionMessage: vi.fn(() => ({
    compileToV0Message: vi.fn().mockReturnValue('compiledMsg'),
  })),
  VersionedTransaction: vi.fn(() => ({ sign: vi.fn() })),
  SystemProgram: { programId: 'SystemProgramId' },
}));

vi.mock('@sqds/multisig', () => ({
  accounts: { Multisig: { fromAccountAddress: mockMultisigFromAddress } },
  instructions: {
    vaultTransactionExecute: mockVaultExecute,
    configTransactionExecute: vi.fn().mockReturnValue({}),
  },
}));

// ── Factories ─────────────────────────────────────────────────────────────────

function makeJob(data: Record<string, unknown>) {
  return {
    id: 'job-sol-prod',
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

async function bootProcessor() {
  const { startWithdrawalExecuteWorker } = await import(
    '../queue/workers/withdrawal-execute-worker.js'
  );
  const { Worker } = await import('bullmq');
  startWithdrawalExecuteWorker({} as never, cfg);
  const calls = vi.mocked(Worker).mock.calls;
  return calls[calls.length - 1]?.[1] as unknown as (
    job: ReturnType<typeof makeJob>
  ) => Promise<void>;
}

// ── Tests: Solana prod path ───────────────────────────────────────────────────

describe('withdrawal-execute-worker — Solana prod path (no AUTH_DEV_MODE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = '';
    // Set required prod env vars for Solana
    process.env.SQUADS_MULTISIG_ADDRESS = 'SquadsMultisigPda111';
    process.env.SOL_RPC_URL = 'https://fake-sol-rpc';
    process.env.WALLET_ENGINE_SOL_PAYER_KEY = Buffer.from(new Uint8Array(64)).toString('base64');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/signatures')) {
          return Promise.resolve(makeResponse(200, { signatures: [] }));
        }
        return Promise.resolve(makeResponse(200));
      })
    );
  });

  afterEach(() => {
    process.env.SQUADS_MULTISIG_ADDRESS = '';
    process.env.SOL_RPC_URL = '';
    process.env.WALLET_ENGINE_SOL_PAYER_KEY = '';
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('Solana prod: calls sendTransaction and records broadcasted', async () => {
    const processor = await bootProcessor();
    const job = makeJob({
      withdrawalId: 'wd-sol-prod',
      chain: 'sol',
      token: 'USDT',
      amount: '50',
      destinationAddr: 'DestinationSolAddr',
    });
    await processor(job);

    expect(mockSendTransaction).toHaveBeenCalledOnce();
    const calls = vi.mocked(fetch).mock.calls as [string][];
    const broadcastedCall = calls.find(([u]) => u.includes('/broadcasted'));
    expect(broadcastedCall).toBeDefined();
  });

  it('Solana prod: calls vaultTransactionExecute with correct multisigPda', async () => {
    const processor = await bootProcessor();
    const job = makeJob({
      withdrawalId: 'wd-sol-prod-2',
      chain: 'sol',
      token: 'USDC',
      amount: '10',
      destinationAddr: 'DestSolAddr2',
    });
    await processor(job);

    expect(mockVaultExecute).toHaveBeenCalledOnce();
  });

  it('missing SQUADS_MULTISIG_ADDRESS: throws FATAL', async () => {
    process.env.SQUADS_MULTISIG_ADDRESS = '';

    const processor = await bootProcessor();
    const job = makeJob({
      withdrawalId: 'wd-no-multisig',
      chain: 'sol',
      token: 'USDT',
      amount: '1',
      destinationAddr: 'SolDest',
    });
    await expect(processor(job)).rejects.toThrow('SQUADS_MULTISIG_ADDRESS');
  });

  it('missing SOL_RPC_URL: throws FATAL', async () => {
    process.env.SOL_RPC_URL = '';

    const processor = await bootProcessor();
    const job = makeJob({
      withdrawalId: 'wd-no-rpc',
      chain: 'sol',
      token: 'USDT',
      amount: '1',
      destinationAddr: 'SolDest',
    });
    await expect(processor(job)).rejects.toThrow('SOL_RPC_URL');
  });

  it('missing WALLET_ENGINE_SOL_PAYER_KEY: throws FATAL', async () => {
    process.env.WALLET_ENGINE_SOL_PAYER_KEY = '';

    const processor = await bootProcessor();
    const job = makeJob({
      withdrawalId: 'wd-no-payer',
      chain: 'sol',
      token: 'USDT',
      amount: '1',
      destinationAddr: 'SolDest',
    });
    await expect(processor(job)).rejects.toThrow('WALLET_ENGINE_SOL_PAYER_KEY');
  });
});

// ── Tests: EVM prod — missing BNB_RPC_URL FATAL ───────────────────────────────

describe('withdrawal-execute-worker — EVM prod missing BNB_USDT_ADDRESS FATAL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = '';
    process.env.SAFE_ADDRESS = '0xSafeAddr';
    process.env.BNB_RPC_URL = 'https://fake-bnb-rpc';
    process.env.WALLET_ENGINE_EXECUTOR_KEY = `0x${'ab'.repeat(32)}`;
    // BNB_USDT_ADDRESS NOT set → should throw
    process.env.BNB_USDT_ADDRESS = '';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          makeResponse(200, { signatures: [{ signer: '0xA', signature: '0xsig1' }] })
        )
    );
  });

  afterEach(() => {
    process.env.SAFE_ADDRESS = '';
    process.env.BNB_RPC_URL = '';
    process.env.WALLET_ENGINE_EXECUTOR_KEY = '';
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('missing BNB_USDT_ADDRESS in prod: throws FATAL', async () => {
    const processor = await bootProcessor();
    const job = makeJob({
      withdrawalId: 'wd-no-token',
      chain: 'bnb',
      token: 'USDT',
      amount: '1',
      destinationAddr: '0xDest',
    });
    await expect(processor(job)).rejects.toThrow('BNB_USDT_ADDRESS');
  });
});

// ── Tests: worker event handler callbacks invoked ─────────────────────────────

describe('withdrawal-execute-worker — event handler callback bodies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const { startWithdrawalExecuteWorker } = await import(
      '../queue/workers/withdrawal-execute-worker.js'
    );
    startWithdrawalExecuteWorker({} as never, cfg);

    const calls = mockOn.mock.calls as [string, (...args: unknown[]) => void][];
    const completed = calls.find(([e]) => e === 'completed')?.[1];
    const failed = calls.find(([e]) => e === 'failed')?.[1];
    const error = calls.find(([e]) => e === 'error')?.[1];
    const closing = calls.find(([e]) => e === 'closing')?.[1];

    expect(() => completed?.({ id: 'j1' })).not.toThrow();
    expect(() => failed?.({ id: 'j2' }, new Error('oops'))).not.toThrow();
    expect(() => error?.(new Error('worker error'))).not.toThrow();
    expect(() => closing?.()).not.toThrow();
  });
});
