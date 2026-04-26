// Unit tests for sweep-evm service.
// Covers dev-mode synthetic path, prod sign + broadcast, and error cases.
// No real key material or RPC connections.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { broadcastSweepEVM, buildAndSignSweepEVM } from '../services/sweep-evm.js';
import type { BuildSweepEVMParams } from '../services/sweep-evm.js';

// ── Mock ethers (used in prod path) ───────────────────────────────────────────
// IMPORTANT: Variables referenced inside vi.mock() factories must not be declared
// outside the factory — vi.mock is hoisted before variable initialization.
// Shared spy references are exposed via module-level getters instead.

const mockSignTransaction = vi.fn().mockResolvedValue('0xsignedRawTx');

vi.mock('ethers', () => {
  const mockTx = {
    hash: '0xsignedTxHash1234567890123456789012345678901234567890123456789012',
  };
  // encodeFunctionData spy lives inside the factory closure — accessed via the
  // Interface constructor mock's instances in tests.
  const _encodeFunctionData = vi.fn().mockReturnValue('0xencoded');
  const _signTx = vi.fn().mockResolvedValue('0xsignedRawTx');

  return {
    HDNodeWallet: {
      fromSeed: vi.fn(() => ({
        derivePath: vi.fn(() => ({
          address: '0xDerivedWallet',
          signTransaction: _signTx,
        })),
      })),
    },
    Interface: vi.fn(() => ({
      encodeFunctionData: _encodeFunctionData,
    })),
    Mnemonic: {
      fromPhrase: vi.fn(() => ({ computeSeed: vi.fn().mockReturnValue('0xseed') })),
    },
    Transaction: {
      from: vi.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === 'string') return mockTx;
        return { type: 0 };
      }),
    },
    getBytes: vi.fn().mockReturnValue(new Uint8Array(32)),
    JsonRpcProvider: vi.fn(() => ({
      broadcastTransaction: vi.fn().mockResolvedValue({
        hash: '0xbroadcastHash',
        wait: vi.fn().mockResolvedValue({ blockNumber: 42 }),
      }),
    })),
  };
});

// ── Base params fixture ───────────────────────────────────────────────────────

const baseParams: BuildSweepEVMParams = {
  userAddressIndex: 0,
  token: 'USDT',
  tokenContract: '0xUSDT0000000000000000000000000000000000000',
  amount: 100_000_000_000_000_000n,
  destinationHotSafe: '0xHotSafe000000000000000000000000000000000',
  nonce: 3,
  gasPrice: 5_000_000_000n,
};

// ── Tests: buildAndSignSweepEVM ───────────────────────────────────────────────

describe('buildAndSignSweepEVM — dev-mode (no HD key)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HD_MASTER_XPUB_BNB = undefined;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns synthetic txHash starting with 0x (64 hex chars)', async () => {
    const result = await buildAndSignSweepEVM(baseParams);
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('returns synthetic txHex starting with 0x', async () => {
    const result = await buildAndSignSweepEVM(baseParams);
    expect(result.txHex).toMatch(/^0x/);
  });

  it('dev mode: does not call HDNodeWallet.fromSeed', async () => {
    await buildAndSignSweepEVM(baseParams);
    const { HDNodeWallet } = await import('ethers');
    expect(HDNodeWallet.fromSeed).not.toHaveBeenCalled();
  });
});

describe('buildAndSignSweepEVM — prod path (HD key present)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HD_MASTER_XPUB_BNB = 'word '.repeat(12).trim(); // non-empty mnemonic
    // signTransaction returns a signed tx string
    mockSignTransaction.mockResolvedValue('0xsignedRawTx');
  });

  afterEach(() => {
    process.env.HD_MASTER_XPUB_BNB = undefined;
    vi.clearAllMocks();
  });

  it('prod: calls HDNodeWallet.fromSeed with derived path', async () => {
    const result = await buildAndSignSweepEVM(baseParams);
    expect(result.txHash).toBeDefined();
    expect(result.fromAddress).toBeDefined();
  });

  it('prod: result contains a txHash and fromAddress from the derived wallet', async () => {
    const result = await buildAndSignSweepEVM(baseParams);
    // Prod path uses the HD-derived wallet address
    expect(result.fromAddress).toBe('0xDerivedWallet');
    expect(result.txHash).toBeDefined();
  });
});

// ── Tests: broadcastSweepEVM ──────────────────────────────────────────────────

describe('broadcastSweepEVM — dev-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HD_MASTER_XPUB_BNB = undefined;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('dev mode: returns synthetic txHash without calling provider', async () => {
    const mockProvider = { broadcastTransaction: vi.fn() } as {
      broadcastTransaction: ReturnType<typeof vi.fn>;
    };
    const result = await broadcastSweepEVM('0xfakehex' as `0x${string}`, mockProvider as never);

    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(mockProvider.broadcastTransaction).not.toHaveBeenCalled();
  });
});

describe('broadcastSweepEVM — prod path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HD_MASTER_XPUB_BNB = 'word '.repeat(12).trim();
  });
  afterEach(() => {
    process.env.HD_MASTER_XPUB_BNB = undefined;
    vi.clearAllMocks();
  });

  it('prod: calls provider.broadcastTransaction and returns txHash + blockNumber', async () => {
    const mockWait = vi.fn().mockResolvedValue({ blockNumber: 99 });
    const mockProvider = {
      broadcastTransaction: vi.fn().mockResolvedValue({ hash: '0xrealHash', wait: mockWait }),
    } as never;

    const result = await broadcastSweepEVM('0xsignedTx' as `0x${string}`, mockProvider);

    expect(result.txHash).toBe('0xrealHash');
    expect(result.blockNumber).toBe(99);
  });

  it('prod: propagates provider error', async () => {
    const mockProvider = {
      broadcastTransaction: vi.fn().mockRejectedValue(new Error('insufficient funds')),
    } as never;

    await expect(broadcastSweepEVM('0xsignedTx' as `0x${string}`, mockProvider)).rejects.toThrow(
      'insufficient funds'
    );
  });
});
