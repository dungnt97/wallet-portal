// Unit tests for solana-transfer-builder.ts
// Tests: native SOL path (routing + output structure), SPL USDT/USDC paths,
// and missing env var error guards.
// NOTE: @solana/web3.js SystemProgram.transfer uses buffer-layout which requires
// Node.js Buffer polyfill not available in jsdom. We mock SystemProgram.transfer
// to return a stub instruction and test our wrapper's routing/construction logic.
import { PublicKey } from '@solana/web3.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted runs before vi.mock() factory — ensures spy is ready when the mock factory runs
const { mockSystemTransfer } = vi.hoisted(() => {
  // biome-ignore lint/suspicious/noExplicitAny: test stub params
  const mockSystemTransfer = vi.fn((params: any) => ({
    programId: { toBase58: () => '11111111111111111111111111111111' },
    keys: [
      { pubkey: params.fromPubkey, isSigner: true, isWritable: true },
      { pubkey: params.toPubkey, isSigner: false, isWritable: true },
    ],
    data: new Uint8Array(12),
  }));
  return { mockSystemTransfer };
});

// Mock SystemProgram.transfer since buffer-layout is incompatible with jsdom
vi.mock('@solana/web3.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('@solana/web3.js')>();
  return {
    ...real,
    SystemProgram: {
      ...real.SystemProgram,
      transfer: mockSystemTransfer,
    },
  };
});

// Mock @sqds/multisig so deriveVaultPda works without real program seeds
vi.mock('@sqds/multisig', () => {
  const vaultPda = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bXo');
  return {
    getVaultPda: vi.fn(() => [vaultPda, 255]),
    getTransactionPda: vi.fn(() => [vaultPda, 255]),
    accounts: {
      Multisig: { fromAccountAddress: vi.fn() },
      Proposal: { fromAccountAddress: vi.fn() },
    },
    instructions: {
      vaultTransactionCreate: vi.fn(() => ({
        keys: [],
        programId: vaultPda,
        data: Buffer.alloc(0),
      })),
      proposalCreate: vi.fn(() => ({ keys: [], programId: vaultPda, data: Buffer.alloc(0) })),
      proposalApprove: vi.fn(() => ({ keys: [], programId: vaultPda, data: Buffer.alloc(0) })),
    },
  };
});

import type { SigningOp } from '../signing-flow-types';
// Import after mocks
import { buildSolanaTransferInstruction } from '../solana-transfer-builder';

// ── Helpers ────────────────────────────────────────────────────────────────

// Use valid base58 Solana addresses
const VALID_MULTISIG_PDA = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bXo';
const VALID_USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const VALID_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const VALID_DEST = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bXo';

function makeOp(overrides: Partial<SigningOp> = {}): SigningOp {
  return {
    id: 'op-001',
    chain: 'sol',
    token: 'USDT',
    amount: 10,
    destination: VALID_DEST,
    withdrawalId: 'wd-001',
    signaturesRequired: 2,
    totalSigners: 3,
    ...overrides,
  };
}

const fromPubkey = new PublicKey('SysvarC1ock11111111111111111111111111111111');

// ── Native SOL path ───────────────────────────────────────────────────────

describe('buildSolanaTransferInstruction — native SOL', () => {
  it('calls SystemProgram.transfer for non-USDT/non-USDC token', () => {
    const op = makeOp({ token: 'SOL' as 'USDT', amount: 1.5 });
    buildSolanaTransferInstruction({ op, fromPubkey });

    expect(mockSystemTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        fromPubkey,
        lamports: expect.any(BigInt),
      })
    );
  });

  it('passes correct lamport amount (1 SOL = 1_000_000_000)', () => {
    const op = makeOp({ token: 'SOL' as 'USDT', amount: 1 });
    buildSolanaTransferInstruction({ op, fromPubkey });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const call = mockSystemTransfer.mock.calls.at(-1)![0];
    expect(call.lamports).toBe(1_000_000_000n);
  });

  it('passes destination as toPubkey', () => {
    const op = makeOp({ token: 'SOL' as 'USDT', amount: 0.5, destination: VALID_DEST });
    buildSolanaTransferInstruction({ op, fromPubkey });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const call = mockSystemTransfer.mock.calls.at(-1)![0];
    expect(call.toPubkey.toBase58()).toBe(VALID_DEST);
  });

  it('rounds fractional lamports', () => {
    const op = makeOp({ token: 'SOL' as 'USDT', amount: 0.000000001 }); // exactly 1 lamport
    buildSolanaTransferInstruction({ op, fromPubkey });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const call = mockSystemTransfer.mock.calls.at(-1)![0];
    expect(call.lamports).toBe(1n);
  });
});

// ── SPL token error guards ────────────────────────────────────────────────
// Only test the early-exit guards — the ATA derivation path uses a fake
// program ID in the source code that can't produce valid PDAs without a
// real Solana runtime.

describe('buildSolanaTransferInstruction — SPL token env guards', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when VITE_SQUADS_MULTISIG_PDA_DEVNET is not set for USDT', () => {
    vi.stubEnv('VITE_SQUADS_MULTISIG_PDA_DEVNET', '');

    expect(() =>
      buildSolanaTransferInstruction({ op: makeOp({ token: 'USDT' }), fromPubkey })
    ).toThrow('[solana-transfer-builder] VITE_SQUADS_MULTISIG_PDA_DEVNET not set');
  });

  it('throws when VITE_SQUADS_MULTISIG_PDA_DEVNET is not set for USDC', () => {
    vi.stubEnv('VITE_SQUADS_MULTISIG_PDA_DEVNET', '');

    expect(() =>
      buildSolanaTransferInstruction({ op: makeOp({ token: 'USDC' }), fromPubkey })
    ).toThrow('[solana-transfer-builder] VITE_SQUADS_MULTISIG_PDA_DEVNET not set');
  });

  it('throws when VITE_SOL_USDT_MINT is not set', () => {
    vi.stubEnv('VITE_SQUADS_MULTISIG_PDA_DEVNET', VALID_MULTISIG_PDA);
    vi.stubEnv('VITE_SOL_USDT_MINT', '');

    expect(() =>
      buildSolanaTransferInstruction({ op: makeOp({ token: 'USDT' }), fromPubkey })
    ).toThrow('[solana-transfer-builder] VITE_SOL_USDT_MINT not set');
  });

  it('throws when VITE_SOL_USDC_MINT is not set', () => {
    vi.stubEnv('VITE_SQUADS_MULTISIG_PDA_DEVNET', VALID_MULTISIG_PDA);
    vi.stubEnv('VITE_SOL_USDC_MINT', '');

    expect(() =>
      buildSolanaTransferInstruction({ op: makeOp({ token: 'USDC' }), fromPubkey })
    ).toThrow('[solana-transfer-builder] VITE_SOL_USDC_MINT not set');
  });

  it('uses VITE_SOL_USDT_MINT env key for USDT token', () => {
    vi.stubEnv('VITE_SQUADS_MULTISIG_PDA_DEVNET', VALID_MULTISIG_PDA);
    // Set USDC mint but NOT USDT mint — should throw about USDT specifically
    vi.stubEnv('VITE_SOL_USDT_MINT', '');
    vi.stubEnv('VITE_SOL_USDC_MINT', VALID_USDC_MINT);

    expect(() =>
      buildSolanaTransferInstruction({ op: makeOp({ token: 'USDT' }), fromPubkey })
    ).toThrow('VITE_SOL_USDT_MINT not set');
  });

  it('uses VITE_SOL_USDC_MINT env key for USDC token', () => {
    vi.stubEnv('VITE_SQUADS_MULTISIG_PDA_DEVNET', VALID_MULTISIG_PDA);
    // Set USDT mint but NOT USDC mint — should throw about USDC specifically
    vi.stubEnv('VITE_SOL_USDT_MINT', VALID_USDT_MINT);
    vi.stubEnv('VITE_SOL_USDC_MINT', '');

    expect(() =>
      buildSolanaTransferInstruction({ op: makeOp({ token: 'USDC' }), fromPubkey })
    ).toThrow('VITE_SOL_USDC_MINT not set');
  });
});
