import { describe, expect, it } from 'vitest';
import { Wallet, WalletPurpose } from '../wallet.js';

describe('WalletPurpose', () => {
  it('accepts all valid purposes', () => {
    const purposes = ['deposit_hd', 'operational', 'cold_reserve'];
    for (const purpose of purposes) {
      const result = WalletPurpose.safeParse(purpose);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid purpose', () => {
    const result = WalletPurpose.safeParse('unknown');
    expect(result.success).toBe(false);
  });
});

describe('Wallet', () => {
  const validWallet = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    chain: 'bnb' as const,
    address: '0x1234567890123456789012345678901234567890',
    tier: 'hot' as const,
    purpose: 'operational' as const,
    multisigAddr: '0x0987654321098765432109876543210987654321',
    derivationPath: "m/44'/0'/0'/0/0",
    policyConfig: { threshold: 2 },
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('parses valid wallet', () => {
    const result = Wallet.safeParse(validWallet);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.purpose).toBe('operational');
      expect(result.data.tier).toBe('hot');
    }
  });

  it('accepts null multisigAddr', () => {
    const result = Wallet.safeParse({
      ...validWallet,
      multisigAddr: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null derivationPath', () => {
    const result = Wallet.safeParse({
      ...validWallet,
      derivationPath: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null policyConfig', () => {
    const result = Wallet.safeParse({
      ...validWallet,
      policyConfig: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts any policyConfig structure', () => {
    const result = Wallet.safeParse({
      ...validWallet,
      policyConfig: { complex: { nested: { structure: [1, 2, 3] } } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid purpose', () => {
    const result = Wallet.safeParse({
      ...validWallet,
      purpose: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid purposes', () => {
    const purposes = ['deposit_hd', 'operational', 'cold_reserve'];
    for (const purpose of purposes) {
      const result = Wallet.safeParse({
        ...validWallet,
        purpose: purpose as any,
      });
      expect(result.success).toBe(true);
    }
  });
});
