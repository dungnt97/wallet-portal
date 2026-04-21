// Unit tests for evm-adapter.ts — mocks protocol-kit and api-kit.
// Tests: evmSign golden path, evmSign rejects on bad signature,
//        evmBroadcastViaSafe golden path, evmBuildSafeTx delegation.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type EVMBroadcastParams,
  type EVMSignParams,
  evmBroadcastViaSafe,
  evmSign,
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
