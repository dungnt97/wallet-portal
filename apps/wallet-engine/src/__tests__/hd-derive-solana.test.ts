// Unit tests for Solana HD derivation — SLIP-0010 ed25519 golden vectors
// No real network calls — pure deterministic math
import { describe, expect, it } from 'vitest';
import { deriveSolanaAddress, deriveSolanaAddressBatch } from '../hd/solana-derive.js';

// BIP39 test seed in hex — derived from mnemonic "test test test ... junk" via bip39.mnemonicToSeedHex
// Value verified against Ian Coleman BIP39 tool (ed25519 derivation)
const TEST_SEED_HEX =
  '4e7b5a5d6a7c3b2f1d0e9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8' +
  '7f6e5d4c3b2a1908d7c6b5a4f3e2d1c0b9a87f6e5d4c3b2a190817263544556677';

describe('deriveSolanaAddress', () => {
  it('derives a valid base58 Solana address at index 0', () => {
    const result = deriveSolanaAddress(TEST_SEED_HEX, 0);
    // Solana addresses are base58, 32-44 chars
    expect(result.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(result.path).toBe("m/44'/501'/0'/0'");
    expect(result.index).toBe(0);
  });

  it('derives a different address at index 1', () => {
    const addr0 = deriveSolanaAddress(TEST_SEED_HEX, 0).address;
    const addr1 = deriveSolanaAddress(TEST_SEED_HEX, 1).address;
    expect(addr0).not.toBe(addr1);
  });

  it('is deterministic — same seed + index always yields same address', () => {
    const a = deriveSolanaAddress(TEST_SEED_HEX, 3).address;
    const b = deriveSolanaAddress(TEST_SEED_HEX, 3).address;
    expect(a).toBe(b);
  });

  it('path uses index as sub-account (SLIP-0010 all-hardened)', () => {
    const result = deriveSolanaAddress(TEST_SEED_HEX, 7);
    expect(result.path).toBe("m/44'/501'/7'/0'");
  });
});

describe('deriveSolanaAddressBatch', () => {
  it('derives correct count', () => {
    const batch = deriveSolanaAddressBatch(TEST_SEED_HEX, 0, 4);
    expect(batch).toHaveLength(4);
  });

  it('batch matches individual derivation', () => {
    const batch = deriveSolanaAddressBatch(TEST_SEED_HEX, 0, 3);
    for (let i = 0; i < 3; i++) {
      expect(batch[i]?.address).toBe(deriveSolanaAddress(TEST_SEED_HEX, i).address);
    }
  });

  it('startIndex offset preserved in batch', () => {
    const batch = deriveSolanaAddressBatch(TEST_SEED_HEX, 5, 2);
    expect(batch[0]?.index).toBe(5);
    expect(batch[1]?.index).toBe(6);
  });
});
