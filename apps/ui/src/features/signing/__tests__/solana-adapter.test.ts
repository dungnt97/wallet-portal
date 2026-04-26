import { PublicKey } from '@solana/web3.js';
// Unit tests for solana-adapter.ts — mocks Connection and wallet adapter.
// Tests: solanaSign golden path, empty message rejection, wallet error propagation.
// solanaProposeSquads and solanaApproveProposal: mocked Connection path.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveVaultPda,
  getSquadsMultisigPda,
  solanaApproveProposal,
  solanaProposeSquads,
  solanaSign,
} from '../solana-adapter';

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

// Top-level import resolves to mock (vi.mock is hoisted)
// biome-ignore lint/suspicious/noExplicitAny: test mock access
import * as multisigMock from '@sqds/multisig';
// biome-ignore lint/suspicious/noExplicitAny: test mock access
const multisigAccounts = multisigMock.accounts as any;

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

// ── solanaProposeSquads ────────────────────────────────────────────────────

describe('solanaProposeSquads', () => {
  const mockPda = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bXo');
  const multisigPda = mockPda;
  const creator = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const walletPubkey = new PublicKey('SysvarRent111111111111111111111111111111111');

  // biome-ignore lint/suspicious/noExplicitAny: test stub
  const fakeMessage = { instructions: [] } as any;

  // biome-ignore lint/suspicious/noExplicitAny: test stub
  const makeConnection = (overrides?: Record<string, unknown>): any => ({
    getLatestBlockhash: vi
      .fn()
      .mockResolvedValue({ blockhash: 'testblockhash', lastValidBlockHeight: 1000 }),
    ...overrides,
  });

  // biome-ignore lint/suspicious/noExplicitAny: test stub
  const makeWallet = (overrides?: Record<string, unknown>): any => ({
    publicKey: walletPubkey,
    sendTransaction: vi.fn().mockResolvedValue('0xproposalsig'),
    ...overrides,
  });

  beforeEach(() => {
    multisigAccounts.Multisig.fromAccountAddress.mockResolvedValue({
      transactionIndex: { toNumber: () => 5 },
    });
  });

  it('throws when wallet not connected', async () => {
    const wallet = makeWallet({ publicKey: null });
    const connection = makeConnection();

    await expect(
      solanaProposeSquads(
        { multisigPda, creator, transactionMessage: fakeMessage },
        connection,
        wallet
      )
    ).rejects.toThrow('[solana-adapter] solanaProposeSquads: wallet not connected');
  });

  it('throws when loading multisig account fails', async () => {
    multisigAccounts.Multisig.fromAccountAddress.mockRejectedValue(new Error('RPC unavailable'));

    const wallet = makeWallet();
    const connection = makeConnection();

    await expect(
      solanaProposeSquads(
        { multisigPda, creator, transactionMessage: fakeMessage },
        connection,
        wallet
      )
    ).rejects.toThrow(
      '[solana-adapter] solanaProposeSquads: failed to load multisig: RPC unavailable'
    );
  });

  it('throws when sendTransaction fails', async () => {
    const wallet = makeWallet({
      sendTransaction: vi.fn().mockRejectedValue(new Error('Transaction rejected')),
    });
    const connection = makeConnection();

    await expect(
      solanaProposeSquads(
        { multisigPda, creator, transactionMessage: fakeMessage },
        connection,
        wallet
      )
    ).rejects.toThrow(
      '[solana-adapter] solanaProposeSquads: sendTransaction failed: Transaction rejected'
    );
  });

  it('returns proposalPubkey and signature on success', async () => {
    const wallet = makeWallet();
    const connection = makeConnection();

    const result = await solanaProposeSquads(
      { multisigPda, creator, transactionMessage: fakeMessage, memo: 'test memo' },
      connection,
      wallet
    );

    expect(result.signature).toBe('0xproposalsig');
    expect(result.proposalPubkey).toBeInstanceOf(PublicKey);
  });

  it('works with bigint transactionIndex', async () => {
    multisigAccounts.Multisig.fromAccountAddress.mockResolvedValue({
      transactionIndex: 3n,
    });

    const wallet = makeWallet();
    const connection = makeConnection();

    const result = await solanaProposeSquads(
      { multisigPda, creator, transactionMessage: fakeMessage },
      connection,
      wallet
    );

    expect(result.signature).toBe('0xproposalsig');
  });
});

// ── solanaApproveProposal ──────────────────────────────────────────────────

describe('solanaApproveProposal', () => {
  const mockPda = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bXo');
  const walletPubkey = new PublicKey('SysvarRent111111111111111111111111111111111');

  // biome-ignore lint/suspicious/noExplicitAny: test stub
  const makeConnection = (overrides?: Record<string, unknown>): any => ({
    getLatestBlockhash: vi
      .fn()
      .mockResolvedValue({ blockhash: 'testblockhash2', lastValidBlockHeight: 2000 }),
    ...overrides,
  });

  // biome-ignore lint/suspicious/noExplicitAny: test stub
  const makeWallet = (overrides?: Record<string, unknown>): any => ({
    publicKey: walletPubkey,
    sendTransaction: vi.fn().mockResolvedValue('0xapprovalsig'),
    ...overrides,
  });

  beforeEach(() => {
    multisigAccounts.Proposal.fromAccountAddress.mockResolvedValue({
      multisig: mockPda,
      transactionIndex: { toNumber: () => 3 },
    });
  });

  it('throws when wallet not connected', async () => {
    const wallet = makeWallet({ publicKey: null });
    const connection = makeConnection();

    await expect(solanaApproveProposal(mockPda, wallet, connection)).rejects.toThrow(
      '[solana-adapter] solanaApproveProposal: wallet not connected'
    );
  });

  it('throws when loading proposal account fails', async () => {
    multisigAccounts.Proposal.fromAccountAddress.mockRejectedValue(new Error('Account not found'));

    const wallet = makeWallet();
    const connection = makeConnection();

    await expect(solanaApproveProposal(mockPda, wallet, connection)).rejects.toThrow(
      '[solana-adapter] solanaApproveProposal: failed to load proposal: Account not found'
    );
  });

  it('throws when sendTransaction fails', async () => {
    const wallet = makeWallet({
      sendTransaction: vi.fn().mockRejectedValue(new Error('Insufficient funds')),
    });
    const connection = makeConnection();

    await expect(solanaApproveProposal(mockPda, wallet, connection)).rejects.toThrow(
      '[solana-adapter] solanaApproveProposal: sendTransaction failed: Insufficient funds'
    );
  });

  it('returns signature on success', async () => {
    const wallet = makeWallet();
    const connection = makeConnection();

    const result = await solanaApproveProposal(mockPda, wallet, connection);
    expect(result.signature).toBe('0xapprovalsig');
  });

  it('works with bigint proposalAccount.transactionIndex', async () => {
    multisigAccounts.Proposal.fromAccountAddress.mockResolvedValue({
      multisig: mockPda,
      transactionIndex: 7n,
    });

    const wallet = makeWallet();
    const connection = makeConnection();

    const result = await solanaApproveProposal(mockPda, wallet, connection);
    expect(result.signature).toBe('0xapprovalsig');
  });
});
