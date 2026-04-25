// Unit tests for sweep-solana service.
// Covers dev-mode synthetic path, prod sign + broadcast, and error cases.
// No real key material or RPC connections.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { broadcastSweepSolana, buildAndSignSweepSolana } from '../services/sweep-solana.js';
import type { BuildSweepSolanaParams } from '../services/sweep-solana.js';

// ── Mock ed25519-hd-key ────────────────────────────────────────────────────────

vi.mock('ed25519-hd-key', () => ({
  derivePath: vi.fn().mockReturnValue({ key: new Uint8Array(32).fill(1) }),
}));

// ── Mock @solana/web3.js ───────────────────────────────────────────────────────

const mockSign = vi.fn();
const mockSerialize = vi.fn().mockReturnValue(Buffer.from('serialized'));
const mockSendRawTransaction = vi
  .fn()
  .mockResolvedValue(
    'realSig1111111111111111111111111111111111111111111111111111111111111111111111111111111111'
  );
const mockConfirmTransaction = vi.fn().mockResolvedValue({ context: { slot: 55 } });
const mockGetLatestBlockhash = vi.fn().mockResolvedValue({ blockhash: 'recentHash' });

// NOTE: makePubkey cannot be used inside vi.mock factory (hoisting issue).
// All fake pubkey objects are defined as plain literals directly inside the factory.

vi.mock('@solana/web3.js', () => {
  const PublicKey = vi.fn().mockImplementation((v: string) => ({
    toString: () => v,
    toBase58: () => v,
    toBuffer: () => Buffer.alloc(32, 1),
  }));

  // Static method — used by getAssociatedTokenAddress
  (PublicKey as unknown as { findProgramAddress: ReturnType<typeof vi.fn> }).findProgramAddress = vi
    .fn()
    .mockResolvedValue([{ toBase58: () => 'FakePDA', toBuffer: () => Buffer.alloc(32, 2) }, 255]);

  return {
    Connection: vi.fn(() => ({
      sendRawTransaction: mockSendRawTransaction,
      confirmTransaction: mockConfirmTransaction,
      getLatestBlockhash: mockGetLatestBlockhash,
    })),
    Keypair: {
      fromSeed: vi.fn().mockReturnValue({
        publicKey: { toBase58: () => 'FakeKeypairPub', toBuffer: () => Buffer.alloc(32, 1) },
        secretKey: new Uint8Array(64).fill(1),
      }),
    },
    PublicKey,
    SystemProgram: { programId: { toBuffer: () => Buffer.alloc(32) } },
    Transaction: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockReturnThis(),
      sign: mockSign,
      serialize: mockSerialize,
      signatures: [{ signature: Buffer.alloc(64, 0xab) }],
    })),
    TransactionInstruction: vi.fn().mockImplementation(() => ({})),
    sendAndConfirmTransaction: vi.fn().mockResolvedValue('confirmedSig'),
  };
});

// ── Base params fixture ───────────────────────────────────────────────────────
// PublicKey is fully mocked — pass plain cast objects so tests don't need real keys.

function fakePubkey(label: string): import('@solana/web3.js').PublicKey {
  return {
    toString: () => label,
    toBase58: () => label,
    toBuffer: () => Buffer.alloc(32, 1),
  } as unknown as import('@solana/web3.js').PublicKey;
}

function makeParams(): BuildSweepSolanaParams {
  return {
    userAddressIndex: 0,
    mint: fakePubkey('USDTmint'),
    amount: 500_000n,
    destinationHotSafe: fakePubkey('HotSafe'),
  };
}

// ── Tests: buildAndSignSweepSolana ────────────────────────────────────────────

describe('buildAndSignSweepSolana — dev-mode (no seed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HD_MASTER_SEED_SOLANA;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns synthetic txSignature (~88 base58 chars)', async () => {
    const result = await buildAndSignSweepSolana(makeParams(), 'blockhash1');
    expect(result.txSignature).toHaveLength(88);
    expect(result.txSignature).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it('returns base64 txBase64', async () => {
    const result = await buildAndSignSweepSolana(makeParams(), 'blockhash1');
    expect(() => Buffer.from(result.txBase64, 'base64')).not.toThrow();
  });

  it('dev mode: Keypair.fromSeed is not called', async () => {
    await buildAndSignSweepSolana(makeParams(), 'blockhash1');
    const { Keypair } = await import('@solana/web3.js');
    expect(Keypair.fromSeed).not.toHaveBeenCalled();
  });
});

describe('buildAndSignSweepSolana — placeholder seed (dev guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HD_MASTER_SEED_SOLANA = 'your-hex-encoded-seed-here';
  });
  afterEach(() => {
    delete process.env.HD_MASTER_SEED_SOLANA;
    vi.clearAllMocks();
  });

  it('placeholder seed: treated as dev-mode, returns synthetic signature', async () => {
    const result = await buildAndSignSweepSolana(makeParams(), 'blockhash1');
    expect(result.txSignature).toHaveLength(88);
  });
});

describe('buildAndSignSweepSolana — prod path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HD_MASTER_SEED_SOLANA = 'a'.repeat(128); // non-empty, non-placeholder hex seed
  });
  afterEach(() => {
    delete process.env.HD_MASTER_SEED_SOLANA;
    vi.clearAllMocks();
  });

  it('prod: calls Keypair.fromSeed for key derivation', async () => {
    await buildAndSignSweepSolana(makeParams(), 'blockhash1');
    const { Keypair } = await import('@solana/web3.js');
    expect(Keypair.fromSeed).toHaveBeenCalled();
  });

  it('prod: calls tx.sign with derived keypair', async () => {
    await buildAndSignSweepSolana(makeParams(), 'blockhash1');
    expect(mockSign).toHaveBeenCalled();
  });

  it('prod: returned txBase64 is serialized transaction', async () => {
    const result = await buildAndSignSweepSolana(makeParams(), 'blockhash1');
    expect(result.txBase64).toBe(Buffer.from('serialized').toString('base64'));
  });
});

// ── Tests: broadcastSweepSolana ───────────────────────────────────────────────

describe('broadcastSweepSolana — dev-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HD_MASTER_SEED_SOLANA;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('dev mode: returns synthetic signature without calling sendRawTransaction', async () => {
    const conn = {
      sendRawTransaction: mockSendRawTransaction,
      confirmTransaction: mockConfirmTransaction,
    } as never;
    const result = await broadcastSweepSolana('base64tx', conn);

    expect(result.signature).toHaveLength(88);
    expect(mockSendRawTransaction).not.toHaveBeenCalled();
  });
});

describe('broadcastSweepSolana — prod path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HD_MASTER_SEED_SOLANA = 'a'.repeat(128);
  });
  afterEach(() => {
    delete process.env.HD_MASTER_SEED_SOLANA;
    vi.clearAllMocks();
  });

  it('prod: calls sendRawTransaction and confirmTransaction', async () => {
    const conn = {
      sendRawTransaction: mockSendRawTransaction,
      confirmTransaction: mockConfirmTransaction,
    } as never;

    const result = await broadcastSweepSolana(Buffer.from('faketx').toString('base64'), conn);

    expect(mockSendRawTransaction).toHaveBeenCalledOnce();
    expect(mockConfirmTransaction).toHaveBeenCalledOnce();
    expect(result.signature).toBeDefined();
    expect(result.slot).toBe(55);
  });

  it('prod: propagates sendRawTransaction error', async () => {
    const conn = {
      sendRawTransaction: vi.fn().mockRejectedValue(new Error('blockhash expired')),
      confirmTransaction: mockConfirmTransaction,
    } as never;

    await expect(
      broadcastSweepSolana(Buffer.from('faketx').toString('base64'), conn)
    ).rejects.toThrow('blockhash expired');
  });
});
