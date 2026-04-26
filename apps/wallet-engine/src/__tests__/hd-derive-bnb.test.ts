// Unit tests for BNB HD derivation — BIP44 golden vector validation
// Uses standard BIP39 test mnemonic; verifies deterministic addresses
import { describe, expect, it } from 'vitest';
import { deriveBnbAddress, deriveBnbAddressBatch } from '../hd/bnb-derive.js';

// Standard BIP39 test mnemonic (public domain test vector)
const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

describe('deriveBnbAddress', () => {
  it('derives a deterministic address at index 0', () => {
    const result = deriveBnbAddress(TEST_MNEMONIC, 0);
    expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.path).toBe("m/44'/60'/0'/0/0");
    expect(result.index).toBe(0);
  });

  it('derives a different address at index 1', () => {
    const addr0 = deriveBnbAddress(TEST_MNEMONIC, 0).address;
    const addr1 = deriveBnbAddress(TEST_MNEMONIC, 1).address;
    expect(addr0).not.toBe(addr1);
  });

  it('is deterministic — same mnemonic + index always yields same address', () => {
    const a = deriveBnbAddress(TEST_MNEMONIC, 5).address;
    const b = deriveBnbAddress(TEST_MNEMONIC, 5).address;
    expect(a).toBe(b);
  });

  it('uses custom account path segment', () => {
    const result = deriveBnbAddress(TEST_MNEMONIC, 0, 1);
    expect(result.path).toBe("m/44'/60'/1'/0/0");
  });

  it('known BIP44 golden vector — Hardhat test mnemonic index 0', () => {
    // Hardhat default: "test test test test test test test test test test test junk"
    // index 0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (well-known value)
    const result = deriveBnbAddress(TEST_MNEMONIC, 0);
    expect(result.address.toLowerCase()).toBe('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
  });
});

describe('deriveBnbAddressBatch', () => {
  it('derives correct count of addresses', () => {
    const batch = deriveBnbAddressBatch(TEST_MNEMONIC, 0, 5);
    expect(batch).toHaveLength(5);
  });

  it('batch addresses match individual derivation', () => {
    const batch = deriveBnbAddressBatch(TEST_MNEMONIC, 0, 3);
    for (let i = 0; i < 3; i++) {
      expect(batch[i]?.address).toBe(deriveBnbAddress(TEST_MNEMONIC, i).address);
    }
  });

  it('startIndex offset works correctly', () => {
    const batch = deriveBnbAddressBatch(TEST_MNEMONIC, 10, 2);
    expect(batch[0]?.index).toBe(10);
    expect(batch[1]?.index).toBe(11);
    expect(batch[0]?.address).toBe(deriveBnbAddress(TEST_MNEMONIC, 10).address);
  });
});
