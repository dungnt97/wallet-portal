// Unit tests for evm-adapter.ts — mocks protocol-kit and api-kit.
// Tests: evmSign golden path, evmSign rejects on bad signature,
//        evmBroadcastViaSafe golden path, evmBuildSafeTx delegation.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type EVMBroadcastParams,
  type EVMBuildSafeTxParams,
  type EVMSignParams,
  evmBroadcastViaSafe,
  evmBuildSafeTx,
  evmSign,
  getSafeTxServiceUrl,
} from '../evm-adapter';

// ── evmSign ────────────────────────────────────────────────────────────────

describe('evmSign', () => {
  const validTypedData: EVMSignParams['typedData'] = {
    domain: {
      name: 'Safe',
      version: '1.4.1',
      chainId: 97,
      verifyingContract: '0xSafeAddr' as `0x${string}`,
    },
    types: { SafeTx: [{ name: 'to', type: 'address' }] },
    primaryType: 'SafeTx',
    message: { to: '0xDest' },
  };

  it('returns EVMSignResult with signature and signer on success', async () => {
    const mockSignFn = vi.fn().mockResolvedValue('0xabc123deadbeef' as `0x${string}`);

    const result = await evmSign(
      { typedData: validTypedData, fromAddress: '0xSigner' as `0x${string}` },
      mockSignFn
    );

    expect(mockSignFn).toHaveBeenCalledOnce();
    expect(result.signature).toBe('0xabc123deadbeef');
    expect(result.signer).toBe('0xSigner');
    expect(result.signedAt).toBeInstanceOf(Date);
  });

  it('forwards domain, types, primaryType, message to signTypedDataAsync', async () => {
    const mockSignFn = vi.fn().mockResolvedValue('0xdeadbeef' as `0x${string}`);

    await evmSign(
      { typedData: validTypedData, fromAddress: '0xSigner' as `0x${string}` },
      mockSignFn
    );

    expect(mockSignFn).toHaveBeenCalledWith({
      domain: validTypedData.domain,
      types: validTypedData.types,
      primaryType: validTypedData.primaryType,
      message: validTypedData.message,
    });
  });

  it('throws with descriptive message when wallet rejects', async () => {
    const mockSignFn = vi.fn().mockRejectedValue(new Error('User denied signature'));

    await expect(
      evmSign({ typedData: validTypedData, fromAddress: '0xSigner' as `0x${string}` }, mockSignFn)
    ).rejects.toThrow('[evm-adapter] evmSign: User denied signature');
  });

  it('throws when wallet returns empty signature', async () => {
    const mockSignFn = vi.fn().mockResolvedValue('' as `0x${string}`);

    await expect(
      evmSign({ typedData: validTypedData, fromAddress: '0xSigner' as `0x${string}` }, mockSignFn)
    ).rejects.toThrow('[evm-adapter] evmSign: invalid signature');
  });

  it('throws when wallet returns non-hex signature', async () => {
    const mockSignFn = vi.fn().mockResolvedValue('not-a-hex' as `0x${string}`);

    await expect(
      evmSign({ typedData: validTypedData, fromAddress: '0xSigner' as `0x${string}` }, mockSignFn)
    ).rejects.toThrow('[evm-adapter] evmSign: invalid signature');
  });
});

// ── evmBroadcastViaSafe ────────────────────────────────────────────────────

describe('evmBroadcastViaSafe', () => {
  const validParams: EVMBroadcastParams = {
    safeAddress: '0xSafeAddr' as `0x${string}`,
    safeTxHash: '0xhash123',
    signatures: [{ signer: '0xSigner' as `0x${string}`, data: '0xsigdata' as `0x${string}` }],
  };

  // Minimal ApiKit mock — cast via unknown to avoid importing full SafeApiKit type
  const makeApiKit = (overrides?: Record<string, unknown>) =>
    ({
      confirmTransaction: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    }) as unknown as import('@safe-global/api-kit').default;

  it('calls confirmTransaction for each signature', async () => {
    const apiKit = makeApiKit();
    const result = await evmBroadcastViaSafe(validParams, apiKit);

    expect(apiKit.confirmTransaction).toHaveBeenCalledOnce();
    expect(apiKit.confirmTransaction).toHaveBeenCalledWith('0xhash123', '0xsigdata');
    expect(result.txHash).toBe('0xhash123');
  });

  it('calls confirmTransaction for multiple signatures', async () => {
    const apiKit = makeApiKit();
    const params: EVMBroadcastParams = {
      ...validParams,
      signatures: [
        { signer: '0xSigner1' as `0x${string}`, data: '0xsig1' as `0x${string}` },
        { signer: '0xSigner2' as `0x${string}`, data: '0xsig2' as `0x${string}` },
      ],
    };
    await evmBroadcastViaSafe(params, apiKit);
    expect(apiKit.confirmTransaction).toHaveBeenCalledTimes(2);
  });

  it('throws with descriptive message when confirmTransaction fails', async () => {
    const apiKit = makeApiKit({
      confirmTransaction: vi.fn().mockRejectedValue(new Error('Network error')),
    });

    await expect(evmBroadcastViaSafe(validParams, apiKit)).rejects.toThrow(
      '[evm-adapter] evmBroadcastViaSafe: confirmTransaction failed: Network error'
    );
  });

  it('throws when safeAddress is missing', async () => {
    const apiKit = makeApiKit();
    const params = { ...validParams, safeAddress: '' as `0x${string}` };

    await expect(evmBroadcastViaSafe(params, apiKit)).rejects.toThrow(
      '[evm-adapter] evmBroadcastViaSafe: safeAddress required'
    );
  });

  it('throws when safeTxHash is missing', async () => {
    const apiKit = makeApiKit();
    const params = { ...validParams, safeTxHash: '' };

    await expect(evmBroadcastViaSafe(params, apiKit)).rejects.toThrow(
      '[evm-adapter] evmBroadcastViaSafe: safeTxHash required'
    );
  });
});

// ── getSafeTxServiceUrl ────────────────────────────────────────────────────

describe('getSafeTxServiceUrl', () => {
  it('returns fallback URL when env var not set', () => {
    // VITE_SAFE_TX_SERVICE_URL is not set in test env
    const url = getSafeTxServiceUrl();
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
    expect(url).toContain('safe');
  });
});

// ── evmBuildSafeTx ─────────────────────────────────────────────────────────

describe('evmBuildSafeTx', () => {
  const makeTxData = (overrides = {}) => ({
    to: '0xTokenContract' as `0x${string}`,
    value: '0',
    data: '0xa9059cbb' as `0x${string}`,
    operation: 0,
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    refundReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    nonce: '1',
    ...overrides,
  });

  const makeProtocolKit = (overrides?: Record<string, unknown>) =>
    ({
      createTransaction: vi.fn().mockResolvedValue({ data: makeTxData() }),
      getTransactionHash: vi.fn().mockResolvedValue('0xtxhash123'),
      ...overrides,
    }) as unknown as EVMBuildSafeTxParams['protocolKit'];

  it('throws when safeAddress is empty', async () => {
    const protocolKit = makeProtocolKit();
    await expect(
      evmBuildSafeTx({
        safeAddress: '' as `0x${string}`,
        to: '0xTo',
        value: BigInt(0),
        data: '0x',
        protocolKit,
      })
    ).rejects.toThrow('[evm-adapter] evmBuildSafeTx: safeAddress required');
  });

  it('returns safeTxHash and typedData on success', async () => {
    const protocolKit = makeProtocolKit();
    const result = await evmBuildSafeTx({
      safeAddress: '0xSafe' as `0x${string}`,
      to: '0xTo',
      value: BigInt(1000000),
      data: '0xa9059cbb',
      protocolKit,
    });

    expect(result.safeTxHash).toBe('0xtxhash123');
    expect(result.typedData.primaryType).toBe('SafeTx');
    expect(result.typedData.domain.name).toBe('Safe');
    expect(result.typedData.domain.verifyingContract).toBe('0xSafe');
  });

  it('passes correct tx fields to createTransaction', async () => {
    const protocolKit = makeProtocolKit();
    await evmBuildSafeTx({
      safeAddress: '0xSafe' as `0x${string}`,
      to: '0xTokenAddr',
      value: BigInt(0),
      data: '0xdata',
      protocolKit,
    });

    expect(protocolKit.createTransaction).toHaveBeenCalledWith({
      transactions: [{ to: '0xTokenAddr', value: '0', data: '0xdata' }],
    });
  });

  it('throws when createTransaction fails', async () => {
    const protocolKit = makeProtocolKit({
      createTransaction: vi.fn().mockRejectedValue(new Error('RPC error')),
    });
    await expect(
      evmBuildSafeTx({
        safeAddress: '0xSafe' as `0x${string}`,
        to: '0xTo',
        value: BigInt(0),
        data: '0x',
        protocolKit,
      })
    ).rejects.toThrow('[evm-adapter] evmBuildSafeTx: createTransaction failed: RPC error');
  });

  it('throws when getTransactionHash fails', async () => {
    const protocolKit = makeProtocolKit({
      getTransactionHash: vi.fn().mockRejectedValue(new Error('Hash error')),
    });
    await expect(
      evmBuildSafeTx({
        safeAddress: '0xSafe' as `0x${string}`,
        to: '0xTo',
        value: BigInt(0),
        data: '0x',
        protocolKit,
      })
    ).rejects.toThrow('[evm-adapter] evmBuildSafeTx: getTransactionHash failed: Hash error');
  });
});
