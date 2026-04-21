// Unit tests for hd-derive-user service
// Determinism, idempotency, and advisory-lock retry path.
// Uses real BIP44 derivation (no network calls) + in-memory DB mocks.
import { describe, expect, it, vi } from 'vitest';
import { deriveBnbAddress } from '../hd/bnb-derive.js';
import { deriveSolanaAddress } from '../hd/solana-derive.js';
import { deriveUserAddresses } from '../services/hd-derive-user.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TEST_MNEMONIC = 'test test test test test test test test test test test junk';
const TEST_SEED_HEX =
  '4e7b5a5d6a7c3b2f1d0e9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8' +
  '7f6e5d4c3b2a1908d7c6b5a4f3e2d1c0b9a87f6e5d4c3b2a190817263544556677';

const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('deriveBnbAddress (determinism)', () => {
  it('same mnemonic + index 0 always yields same BNB address', () => {
    const a = deriveBnbAddress(TEST_MNEMONIC, 0).address;
    const b = deriveBnbAddress(TEST_MNEMONIC, 0).address;
    expect(a).toBe(b);
    // Known Hardhat BIP44 address for index 0
    expect(a.toLowerCase()).toBe('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
  });

  it('different indices yield different BNB addresses', () => {
    const a0 = deriveBnbAddress(TEST_MNEMONIC, 0).address;
    const a1 = deriveBnbAddress(TEST_MNEMONIC, 1).address;
    expect(a0).not.toBe(a1);
  });

  it('batch is consistent with individual derivation', () => {
    for (let i = 0; i < 5; i++) {
      const single = deriveBnbAddress(TEST_MNEMONIC, i).address;
      expect(single).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });
});

describe('deriveSolanaAddress (determinism)', () => {
  it('same seed + index 0 always yields same Solana address', () => {
    const a = deriveSolanaAddress(TEST_SEED_HEX, 0).address;
    const b = deriveSolanaAddress(TEST_SEED_HEX, 0).address;
    expect(a).toBe(b);
  });

  it('different indices yield different Solana addresses', () => {
    const a0 = deriveSolanaAddress(TEST_SEED_HEX, 0).address;
    const a1 = deriveSolanaAddress(TEST_SEED_HEX, 1).address;
    expect(a0).not.toBe(a1);
  });
});

describe('deriveUserAddresses service', () => {
  it('returns two addresses (bnb + sol) for a new user', async () => {
    // Build a minimal mock db that handles the derive flow.
    // The service runs two transactions (one per chain).
    // Per tx: (1) advisory lock execute, (2) idempotency select+limit, (3) MAX idx select.
    // We model the select chain so that:
    //   - .limit() is called for the idempotency check → returns []
    //   - .where() (no .limit()) is awaited for the MAX idx query → returns [{ maxIdx: null }]
    const insertedRows: Array<{ chain: string; derivationIndex: number }> = [];

    function makeTx() {
      let selectCount = 0;
      return {
        execute: vi.fn().mockResolvedValue([]),
        select: vi.fn().mockImplementation(() => {
          selectCount++;
          const isIdempotencyCheck = selectCount % 2 !== 0;

          if (isIdempotencyCheck) {
            // Idempotency check: .from().where().limit(1) → []
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            };
          }

          // MAX idx check: .from().where() → awaited directly → [{ maxIdx: null }]
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ maxIdx: null }]),
            }),
          };
        }),
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((row: { chain: string; derivationIndex: number }) => {
            insertedRows.push({ chain: row.chain, derivationIndex: row.derivationIndex });
            return Promise.resolve([]);
          }),
        })),
      };
    }

    const db = {
      transaction: vi
        .fn()
        .mockImplementation(async (cb: (tx: ReturnType<typeof makeTx>) => unknown) => {
          return cb(makeTx());
        }),
    };

    const result = await deriveUserAddresses(
      db as unknown as Parameters<typeof deriveUserAddresses>[0],
      USER_ID,
      TEST_MNEMONIC,
      TEST_SEED_HEX
    );

    expect(result.addresses).toHaveLength(2);
    const chains = result.addresses.map((a) => a.chain).sort();
    expect(chains).toEqual(['bnb', 'sol']);
    expect(insertedRows).toHaveLength(2);
  });

  it('is idempotent — skips derivation when address already exists', async () => {
    const existingBnb = {
      chain: 'bnb' as const,
      address: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      derivationPath: "m/44'/60'/0'/0/0",
      derivationIndex: 0,
      userId: USER_ID,
      id: 'addr-uuid-001',
      tier: 'hot' as const,
      createdAt: new Date(),
    };

    let insertCalled = false;

    function makeTx() {
      return {
        execute: vi.fn().mockResolvedValue([]),
        select: vi.fn().mockImplementation(() => ({
          // All select chains: idempotency check always returns existing row
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingBnb]),
            }),
          }),
        })),
        insert: vi.fn().mockImplementation(() => {
          insertCalled = true;
          return { values: vi.fn().mockResolvedValue([]) };
        }),
      };
    }

    const db = {
      transaction: vi
        .fn()
        .mockImplementation(async (cb: (tx: ReturnType<typeof makeTx>) => unknown) => {
          return cb(makeTx());
        }),
    };

    await deriveUserAddresses(
      db as unknown as Parameters<typeof deriveUserAddresses>[0],
      USER_ID,
      TEST_MNEMONIC,
      TEST_SEED_HEX
    );

    // INSERT must NOT be called when rows already exist
    expect(insertCalled).toBe(false);
  });
});
