// Coverage for withdrawal-execute-worker.ts production EVM path (lines 156-200)
// and the toNumber() fallback branch at line 251.
//
// Lines 156-200: broadcastEvmSafe — calls ethers JsonRpcProvider, builds ERC-20 tx,
//   calls Safe.execTransaction, awaits receipt.
// Line 251: BigInt coercion when transactionIndex is NOT a native bigint.
//
// Strategy: mock 'ethers' at module level so dynamic `await import('ethers')` is
// intercepted, then set all required env vars (SAFE_ADDRESS, BNB_RPC_URL,
// WALLET_ENGINE_EXECUTOR_KEY, BNB_USDT_ADDRESS) to non-empty values.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';

// ── Config fixture ────────────────────────────────────────────────────────────

const cfg = {
  ADMIN_API_BASE_URL: 'https://admin.test',
  SVC_BEARER_TOKEN: 'svc-token-test-1234567',
  DATABASE_URL: 'postgres://fake',
} as unknown as AppConfig;

// ── Ethers mock ────────────────────────────────────────────────────────────────
// withdrawal-execute-worker.ts uses `await import('ethers')` at runtime.
// vi.mock() is hoisted and intercepts dynamic imports too.

const mockExecTransaction = vi.fn().mockResolvedValue({
  wait: vi.fn().mockResolvedValue({ hash: '0xevmSafeTxHash', blockNumber: 1234 }),
});
const mockGetNonce = vi.fn().mockResolvedValue(7n);

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>();
  const MockContract = vi.fn().mockImplementation(() => ({
    execTransaction: mockExecTransaction,
    nonce: mockGetNonce,
  }));
  const MockWallet = vi.fn().mockImplementation(() => ({
    address: '0xExecutorAddress',
    signTransaction: vi.fn().mockResolvedValue('0xsigned'),
  }));
  return {
    ...actual,
    // Keep actual parseUnits / ZeroAddress / Interface but override the classes
    ethers: {
      JsonRpcProvider: vi.fn().mockReturnValue({ getBlockNumber: vi.fn().mockResolvedValue(100) }),
      Wallet: MockWallet,
      Contract: MockContract,
      parseUnits: actual.parseUnits,
      ZeroAddress: actual.ZeroAddress,
    },
    Interface: vi.fn().mockImplementation(() => ({
      encodeFunctionData: vi.fn().mockReturnValue('0xencoded'),
    })),
  };
});

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

// ── Mock @sqds/multisig for Solana Squads path ────────────────────────────────

const mockMultisigFromAddress = vi.fn().mockResolvedValue({
  // Return a non-bigint toNumber()-style object to exercise line 251
  transactionIndex: { toNumber: () => 5 },
});
const mockVaultExecute = vi.fn().mockResolvedValue({ instruction: {}, lookupTableAccounts: [] });

vi.mock('@sqds/multisig', () => ({
  accounts: { Multisig: { fromAccountAddress: mockMultisigFromAddress } },
  instructions: { vaultTransactionExecute: mockVaultExecute },
}));

const mockSendTransaction = vi.fn().mockResolvedValue('solSquadsSig999');
const mockConfirmTransaction = vi.fn().mockResolvedValue({ value: {} });
const mockGetLatestBlockhash = vi.fn().mockResolvedValue({ blockhash: 'freshHash' });

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
  })),
  TransactionMessage: vi.fn(() => ({
    compileToV0Message: vi.fn().mockReturnValue('compiledMsg'),
  })),
  VersionedTransaction: vi.fn(() => ({ sign: vi.fn() })),
  SystemProgram: { programId: 'SystemProgramId' },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(data: Record<string, unknown>) {
  return {
    id: 'evm-prod-job',
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

// ── Tests: EVM prod path (broadcastEvmSafe) ───────────────────────────────────

describe('withdrawal-execute-worker — EVM prod path (lines 156-200)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = undefined;
    // Set all required env vars
    process.env.SAFE_ADDRESS = '0xSafeContractAddr';
    process.env.BNB_RPC_URL = 'https://fake-bnb-rpc';
    process.env.WALLET_ENGINE_EXECUTOR_KEY = `0x${'ab'.repeat(32)}`;
    process.env.BNB_USDT_ADDRESS = '0xUSDTAddr';
    process.env.BNB_USDC_ADDRESS = '0xUSDCAddr';

    // execTransaction returns a receipt with hash
    mockExecTransaction.mockResolvedValue({
      wait: vi.fn().mockResolvedValue({ hash: '0xevmSafeTxHash', blockNumber: 5000 }),
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/signatures')) {
          return Promise.resolve(
            makeResponse(200, {
              signatures: [
                { signer: '0xSigner1', signature: `0x${'aa'.repeat(65)}` },
                { signer: '0xSigner2', signature: `0x${'bb'.repeat(65)}` },
              ],
            })
          );
        }
        return Promise.resolve(makeResponse(200));
      })
    );
  });

  afterEach(() => {
    process.env.SAFE_ADDRESS = undefined;
    process.env.BNB_RPC_URL = undefined;
    process.env.WALLET_ENGINE_EXECUTOR_KEY = undefined;
    process.env.BNB_USDT_ADDRESS = undefined;
    process.env.BNB_USDC_ADDRESS = undefined;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('EVM prod: execTransaction called with USDT token address', async () => {
    const processor = await bootProcessor();
    await processor(
      makeJob({
        withdrawalId: 'wd-evm-1',
        chain: 'bnb',
        token: 'USDT',
        amount: '100',
        destinationAddr: '0xDestination',
      })
    );

    expect(mockExecTransaction).toHaveBeenCalledOnce();
  });

  it('EVM prod: callBroadcasted called with Safe execTransaction receipt hash', async () => {
    const processor = await bootProcessor();
    await processor(
      makeJob({
        withdrawalId: 'wd-evm-2',
        chain: 'bnb',
        token: 'USDT',
        amount: '50',
        destinationAddr: '0xDest2',
      })
    );

    const calls = vi.mocked(fetch).mock.calls as [string][];
    const broadcastedCall = calls.find(([u]) => u.includes('/broadcasted'));
    expect(broadcastedCall).toBeDefined();
    const body = JSON.parse(
      (
        vi.mocked(fetch).mock.calls.find(([u]) => (u as string).includes('/broadcasted'))?.[1] as {
          body: string;
        }
      ).body
    ) as { txHash: string };
    expect(body.txHash).toBe('0xevmSafeTxHash');
  });

  it('EVM prod: USDC token uses BNB_USDC_ADDRESS', async () => {
    const processor = await bootProcessor();
    await processor(
      makeJob({
        withdrawalId: 'wd-evm-usdc',
        chain: 'bnb',
        token: 'USDC',
        amount: '200',
        destinationAddr: '0xDestUSDC',
      })
    );

    expect(mockExecTransaction).toHaveBeenCalledOnce();
  });

  it('EVM prod: execTransaction null receipt throws', async () => {
    mockExecTransaction.mockResolvedValueOnce({
      wait: vi.fn().mockResolvedValue(null),
    });

    const processor = await bootProcessor();
    await expect(
      processor(
        makeJob({
          withdrawalId: 'wd-evm-null-receipt',
          chain: 'bnb',
          token: 'USDT',
          amount: '1',
          destinationAddr: '0xDest',
        })
      )
    ).rejects.toThrow(/no receipt/);
  });

  it('EVM prod: missing SAFE_ADDRESS throws FATAL', async () => {
    process.env.SAFE_ADDRESS = undefined;

    const processor = await bootProcessor();
    await expect(
      processor(
        makeJob({
          withdrawalId: 'wd-no-safe',
          chain: 'bnb',
          token: 'USDT',
          amount: '1',
          destinationAddr: '0xDest',
        })
      )
    ).rejects.toThrow('SAFE_ADDRESS');
  });

  it('EVM prod: missing BNB_RPC_URL throws FATAL', async () => {
    process.env.BNB_RPC_URL = undefined;

    const processor = await bootProcessor();
    await expect(
      processor(
        makeJob({
          withdrawalId: 'wd-no-rpc',
          chain: 'bnb',
          token: 'USDT',
          amount: '1',
          destinationAddr: '0xDest',
        })
      )
    ).rejects.toThrow('BNB_RPC_URL');
  });

  it('EVM prod: missing WALLET_ENGINE_EXECUTOR_KEY throws FATAL', async () => {
    process.env.WALLET_ENGINE_EXECUTOR_KEY = undefined;

    const processor = await bootProcessor();
    await expect(
      processor(
        makeJob({
          withdrawalId: 'wd-no-key',
          chain: 'bnb',
          token: 'USDT',
          amount: '1',
          destinationAddr: '0xDest',
        })
      )
    ).rejects.toThrow('WALLET_ENGINE_EXECUTOR_KEY');
  });
});

// ── Tests: Solana toNumber() fallback (line 251) ──────────────────────────────

describe('withdrawal-execute-worker — Solana toNumber() fallback (line 251)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = undefined;
    process.env.SQUADS_MULTISIG_ADDRESS = 'SquadsMultisigPda222';
    process.env.SOL_RPC_URL = 'https://fake-sol-rpc';
    process.env.WALLET_ENGINE_SOL_PAYER_KEY = Buffer.from(new Uint8Array(64)).toString('base64');

    // Return a non-bigint transactionIndex to exercise the toNumber() branch
    mockMultisigFromAddress.mockResolvedValue({
      transactionIndex: { toNumber: () => 7 }, // NOT a bigint → exercises line 251
    });

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
    process.env.SQUADS_MULTISIG_ADDRESS = undefined;
    process.env.SOL_RPC_URL = undefined;
    process.env.WALLET_ENGINE_SOL_PAYER_KEY = undefined;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('Solana: toNumber() path — transactionIndex coerced via .toNumber()', async () => {
    const processor = await bootProcessor();
    await processor(
      makeJob({
        withdrawalId: 'wd-sol-tonumber',
        chain: 'sol',
        token: 'USDT',
        amount: '10',
        destinationAddr: 'SolDest',
      })
    );

    // vaultTransactionExecute called with BigInt(7) (converted via toNumber)
    expect(mockVaultExecute).toHaveBeenCalledOnce();
    const [args] = mockVaultExecute.mock.calls[0] as [{ transactionIndex: bigint }];
    expect(args.transactionIndex).toBe(7n);
  });
});

// ── Tests: unknown chain throws ───────────────────────────────────────────────

describe('withdrawal-execute-worker — unknown chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_DEV_MODE = undefined;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, { signatures: [] })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('unknown chain throws descriptive error', async () => {
    const processor = await bootProcessor();
    await expect(
      processor(
        makeJob({
          withdrawalId: 'wd-unknown',
          chain: 'eth', // not 'bnb' or 'sol'
          token: 'USDT',
          amount: '1',
          destinationAddr: '0xDest',
        })
      )
    ).rejects.toThrow('Unknown chain');
  });
});
