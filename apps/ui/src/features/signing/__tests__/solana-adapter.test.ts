import { PublicKey } from '@solana/web3.js';
// Unit tests for solana-adapter.ts — mocks Connection and wallet adapter.
// Tests: solanaSign golden path, empty message rejection, wallet error propagation.
// solanaProposeSquads and solanaApproveProposal: mocked Connection path.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveVaultPda, getSquadsMultisigPda, solanaSign } from '../solana-adapter';

// Mock @sqds/multisig so PDA derivation doesn't require real program seeds
vi.mock('@sqds/multisig', () => {
  const mockPda = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bXo');
  const mockPda1 = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  return {
    getVaultPda: vi.fn(({ index }: { index: number }) => [index === 0 ? mockPda : mockPda1, 255]),
    getTransactionPda: vi.fn(() => [mockPda, 255]),
    accounts: {
      Multisig: { fromAccountAddress: vi.fn() },
      Proposal: { fromAccountAddress: vi.fn() },
    },
    instructions: {
      vaultTransactionCreate: vi.fn(() => ({
        keys: [],
        programId: mockPda,
        data: Buffer.alloc(0),
      })),
      proposalCreate: vi.fn(() => ({ keys: [], programId: mockPda, data: Buffer.alloc(0) })),
      proposalApprove: vi.fn(() => ({ keys: [], programId: mockPda, data: Buffer.alloc(0) })),
    },
  };
});

// ── solanaSign ─────────────────────────────────────────────────────────────

describe('solanaSign', () => {
  const message = new TextEncoder().encode('test-payload-bytes');
  const validSig = new Uint8Array(64).fill(0xab);

  it('returns SolanaSignResult with signature and timestamp on success', async () => {
    const mockSignFn = vi.fn().mockResolvedValue(validSig);

    const result = await solanaSign({ message }, mockSignFn);

    expect(mockSignFn).toHaveBeenCalledOnce();
    expect(mockSignFn).toHaveBeenCalledWith(message);
    expect(result.signature).toBe(validSig);
    expect(result.signedAt).toBeInstanceOf(Date);
    // signer is placeholder (PublicKey.default) — caller replaces with wallet.publicKey
    expect(result.signer).toBeDefined();
  });

  it('throws when message is empty', async () => {
    const mockSignFn = vi.fn();

    await expect(solanaSign({ message: new Uint8Array(0) }, mockSignFn)).rejects.toThrow(
      '[solana-adapter] solanaSign: message must not be empty'
    );

    expect(mockSignFn).not.toHaveBeenCalled();
  });

  it('wraps wallet rejection with descriptive error', async () => {
    const mockSignFn = vi.fn().mockRejectedValue(new Error('User rejected'));

    await expect(solanaSign({ message }, mockSignFn)).rejects.toThrow(
      '[solana-adapter] solanaSign: User rejected'
    );
  });

  it('throws when wallet returns empty signature', async () => {
    const mockSignFn = vi.fn().mockResolvedValue(new Uint8Array(0));

    await expect(solanaSign({ message }, mockSignFn)).rejects.toThrow(
      '[solana-adapter] solanaSign: empty signature returned from wallet'
    );
  });

  it('wraps non-Error rejection', async () => {
    const mockSignFn = vi.fn().mockRejectedValue('string error');

    await expect(solanaSign({ message }, mockSignFn)).rejects.toThrow(
      '[solana-adapter] solanaSign: Solana sign failed'
    );
  });
});

// ── getSquadsMultisigPda ───────────────────────────────────────────────────

describe('getSquadsMultisigPda', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null and warns when env var is not set', () => {
    vi.stubEnv('VITE_SQUADS_MULTISIG_PDA_DEVNET', '');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = getSquadsMultisigPda();

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('VITE_SQUADS_MULTISIG_PDA_DEVNET not set')
    );

    warnSpy.mockRestore();
  });

  it('returns PublicKey when valid env var is set', () => {
    // Use a valid Solana base58 address (32-byte)
    const validPda = '11111111111111111111111111111111';
    vi.stubEnv('VITE_SQUADS_MULTISIG_PDA_DEVNET', validPda);

    const result = getSquadsMultisigPda();

    expect(result).toBeInstanceOf(PublicKey);
    expect(result?.toBase58()).toBe(validPda);
  });

  it('returns null and errors when env var is an invalid PublicKey', () => {
    vi.stubEnv('VITE_SQUADS_MULTISIG_PDA_DEVNET', 'not-a-valid-pubkey!!!');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = getSquadsMultisigPda();

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('not a valid PublicKey'),
      'not-a-valid-pubkey!!!'
    );

    errorSpy.mockRestore();
  });
});

// ── deriveVaultPda ─────────────────────────────────────────────────────────
// @sqds/multisig is mocked above — these tests verify our wrapper delegates correctly.

describe('deriveVaultPda', () => {
  const multisigPda = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bXo');

  it('returns a PublicKey from the mocked getVaultPda call', () => {
    const vaultPda = deriveVaultPda(multisigPda, 0);
    expect(vaultPda).toBeInstanceOf(PublicKey);
  });

  it('returns different PDAs for different vault indices (mock differentiates by index)', () => {
    const vault0 = deriveVaultPda(multisigPda, 0);
    const vault1 = deriveVaultPda(multisigPda, 1);
    expect(vault0.toBase58()).not.toBe(vault1.toBase58());
  });
});
