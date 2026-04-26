// Unit tests for evm-safe-tx-builder.ts
// Tests: buildEvmSafeTxTypedData golden path, missing token address env error,
// createTransaction failure, getTransactionHash failure.
// @safe-global/protocol-kit is mocked via Safe.init.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockCreateTransaction, mockGetTransactionHash, mockSafeInit } = vi.hoisted(() => {
  const mockCreateTransaction = vi.fn();
  const mockGetTransactionHash = vi.fn();
  const mockSafeInit = vi.fn();
  return { mockCreateTransaction, mockGetTransactionHash, mockSafeInit };
});

vi.mock('@safe-global/protocol-kit', () => ({
  default: {
    init: mockSafeInit,
  },
}));

const makeTxData = (overrides = {}) => ({
  to: '0xTokenAddr',
  value: '0',
  data: '0xa9059cbb',
  operation: 0,
  safeTxGas: '0',
  baseGas: '0',
  gasPrice: '0',
  gasToken: '0x0000000000000000000000000000000000000000',
  refundReceiver: '0x0000000000000000000000000000000000000000',
  nonce: '5',
  ...overrides,
});

// Import after mocks
import { buildEvmSafeTxTypedData } from '../evm-safe-tx-builder';
import type { SigningOp } from '../signing-flow-types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeOp(overrides: Partial<SigningOp> = {}): SigningOp {
  return {
    id: 'op-001',
    chain: 'bnb',
    token: 'USDT',
    amount: 100,
    destination: '0xdestination',
    withdrawalId: 'wd-001',
    multisigOpId: 'msig-001',
    ...overrides,
  };
}

const SAFE_ADDRESS = '0xSafeAddress' as `0x${string}`;

// ── Tests ──────────────────────────────────────────────────────────────────

describe('buildEvmSafeTxTypedData', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_BNB_USDT_ADDRESS', '0xUsdtContractAddr');
    vi.stubEnv('VITE_BNB_USDC_ADDRESS', '0xUsdcContractAddr');

    mockSafeInit.mockResolvedValue({
      createTransaction: mockCreateTransaction,
      getTransactionHash: mockGetTransactionHash,
    });
    mockCreateTransaction.mockResolvedValue({ data: makeTxData() });
    mockGetTransactionHash.mockResolvedValue('0xtxhash_from_safe');
  });

  it('throws when USDT token address env var is missing', async () => {
    vi.stubEnv('VITE_BNB_USDT_ADDRESS', '');

    await expect(
      buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp({ token: 'USDT' }) })
    ).rejects.toThrow('[evm-safe-tx-builder] VITE_BNB_USDT_ADDRESS not set');
  });

  it('throws when USDC token address env var is missing', async () => {
    vi.stubEnv('VITE_BNB_USDC_ADDRESS', '');

    await expect(
      buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp({ token: 'USDC' }) })
    ).rejects.toThrow('[evm-safe-tx-builder] VITE_BNB_USDC_ADDRESS not set');
  });

  it('initialises Safe with correct provider and safeAddress', async () => {
    await buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp() });

    expect(mockSafeInit).toHaveBeenCalledWith(
      expect.objectContaining({ safeAddress: SAFE_ADDRESS })
    );
  });

  it('calls createTransaction with ERC-20 transfer calldata', async () => {
    await buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp() });

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transactions: [
          expect.objectContaining({
            to: '0xUsdtContractAddr',
            value: '0',
          }),
        ],
      })
    );
  });

  it('returns safeTxHash from getTransactionHash', async () => {
    const result = await buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp() });
    expect(result.safeTxHash).toBe('0xtxhash_from_safe');
  });

  it('returns typedData with SafeTx primaryType', async () => {
    const result = await buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp() });
    expect(result.typedData.primaryType).toBe('SafeTx');
  });

  it('returns typedData domain with Safe name and chainId 97', async () => {
    const result = await buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp() });
    expect(result.typedData.domain.name).toBe('Safe');
    expect(result.typedData.domain.chainId).toBe(97);
    expect(result.typedData.domain.verifyingContract).toBe(SAFE_ADDRESS);
  });

  it('includes all 10 SafeTx type fields', async () => {
    const result = await buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp() });
    const fieldNames = result.typedData.types.SafeTx.map((f) => f.name);
    expect(fieldNames).toEqual([
      'to',
      'value',
      'data',
      'operation',
      'safeTxGas',
      'baseGas',
      'gasPrice',
      'gasToken',
      'refundReceiver',
      'nonce',
    ]);
  });

  it('maps tx fields from safeTransaction.data into typedData message', async () => {
    const result = await buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp() });
    expect(result.typedData.message.nonce).toBe('5');
    expect(result.typedData.message.value).toBe('0');
    expect(result.typedData.message.gasToken).toBe('0x0000000000000000000000000000000000000000');
  });

  it('uses USDC token address for USDC op', async () => {
    await buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp({ token: 'USDC' }) });

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transactions: [expect.objectContaining({ to: '0xUsdcContractAddr' })],
      })
    );
  });

  it('encodes ERC-20 calldata starting with transfer selector 0xa9059cbb', async () => {
    await buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp({ amount: 50 }) });

    const txArg = mockCreateTransaction.mock.calls.at(-1)[0].transactions[0];
    expect(txArg.data.startsWith('0xa9059cbb')).toBe(true);
  });

  it('throws when createTransaction rejects', async () => {
    mockCreateTransaction.mockRejectedValue(new Error('RPC down'));

    await expect(
      buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp() })
    ).rejects.toThrow('RPC down');
  });

  it('throws when getTransactionHash rejects', async () => {
    mockGetTransactionHash.mockRejectedValue(new Error('Hash error'));

    await expect(
      buildEvmSafeTxTypedData({ safeAddress: SAFE_ADDRESS, op: makeOp() })
    ).rejects.toThrow('Hash error');
  });
});
