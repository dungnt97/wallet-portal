import { describe, expect, it } from 'vitest';
import {
  AddressBalance,
  DerivedAddress,
  KycTier,
  UserAddress,
  UserAddressWithBalance,
  UserBalance,
  UserRecord,
  UserStatus,
} from '../user.js';

describe('KycTier', () => {
  it('accepts valid tiers', () => {
    const validTiers = ['none', 'basic', 'enhanced'];
    for (const tier of validTiers) {
      const result = KycTier.safeParse(tier);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid tier', () => {
    const result = KycTier.safeParse('premium');
    expect(result.success).toBe(false);
  });
});

describe('UserStatus', () => {
  it('accepts valid statuses', () => {
    const validStatuses = ['active', 'suspended', 'closed'];
    for (const status of validStatuses) {
      const result = UserStatus.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = UserStatus.safeParse('inactive');
    expect(result.success).toBe(false);
  });
});

describe('UserRecord', () => {
  const validUser = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'user@example.com',
    kycTier: 'enhanced' as const,
    riskScore: 50,
    status: 'active' as const,
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('parses valid user record', () => {
    const result = UserRecord.safeParse(validUser);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
      expect(result.data.riskScore).toBe(50);
    }
  });

  it('rejects invalid UUID', () => {
    const result = UserRecord.safeParse({
      ...validUser,
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = UserRecord.safeParse({
      ...validUser,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid KycTier', () => {
    const result = UserRecord.safeParse({
      ...validUser,
      kycTier: 'platinum',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative risk score', () => {
    const result = UserRecord.safeParse({
      ...validUser,
      riskScore: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects risk score above 100', () => {
    const result = UserRecord.safeParse({
      ...validUser,
      riskScore: 101,
    });
    expect(result.success).toBe(false);
  });

  it('accepts risk score 0', () => {
    const result = UserRecord.safeParse({
      ...validUser,
      riskScore: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts risk score 100', () => {
    const result = UserRecord.safeParse({
      ...validUser,
      riskScore: 100,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-integer risk score', () => {
    const result = UserRecord.safeParse({
      ...validUser,
      riskScore: 50.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = UserRecord.safeParse({
      ...validUser,
      status: 'pending',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid datetime', () => {
    const result = UserRecord.safeParse({
      ...validUser,
      createdAt: 'not-a-datetime',
    });
    expect(result.success).toBe(false);
  });

  it('requires all fields', () => {
    const result = UserRecord.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'user@example.com',
    });
    expect(result.success).toBe(false);
  });
});

describe('UserAddress', () => {
  const validAddress = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: '550e8400-e29b-41d4-a716-446655440001',
    chain: 'bnb' as const,
    address: '0x1234567890123456789012345678901234567890',
    derivationPath: "m/44'/0'/0'/0/0",
    derivationIndex: 0,
    tier: 'hot' as const,
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('parses valid user address', () => {
    const result = UserAddress.safeParse(validAddress);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.chain).toBe('bnb');
      expect(result.data.tier).toBe('hot');
      expect(result.data.derivationIndex).toBe(0);
    }
  });

  it('accepts null derivationPath', () => {
    const result = UserAddress.safeParse({
      ...validAddress,
      derivationPath: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative derivationIndex', () => {
    const result = UserAddress.safeParse({
      ...validAddress,
      derivationIndex: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts large derivationIndex', () => {
    const result = UserAddress.safeParse({
      ...validAddress,
      derivationIndex: 1000000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-integer derivationIndex', () => {
    const result = UserAddress.safeParse({
      ...validAddress,
      derivationIndex: 5.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid chain', () => {
    const result = UserAddress.safeParse({
      ...validAddress,
      chain: 'eth',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid tier', () => {
    const result = UserAddress.safeParse({
      ...validAddress,
      tier: 'warm',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid chains', () => {
    const chains = ['bnb', 'sol'];
    for (const chain of chains) {
      const result = UserAddress.safeParse({
        ...validAddress,
        chain: chain as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid tiers', () => {
    const tiers = ['hot', 'cold'];
    for (const tier of tiers) {
      const result = UserAddress.safeParse({
        ...validAddress,
        tier: tier as any,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('AddressBalance', () => {
  it('parses valid balance with both tokens', () => {
    const result = AddressBalance.safeParse({
      USDT: '1000000',
      USDC: '2000000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null USDT', () => {
    const result = AddressBalance.safeParse({
      USDT: null,
      USDC: '2000000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null USDC', () => {
    const result = AddressBalance.safeParse({
      USDT: '1000000',
      USDC: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts both null', () => {
    const result = AddressBalance.safeParse({
      USDT: null,
      USDC: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero balance', () => {
    const result = AddressBalance.safeParse({
      USDT: '0',
      USDC: '0',
    });
    expect(result.success).toBe(true);
  });

  it('requires both fields', () => {
    const result = AddressBalance.safeParse({
      USDT: '1000000',
    });
    expect(result.success).toBe(false);
  });
});

describe('UserAddressWithBalance', () => {
  const baseAddress = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: '550e8400-e29b-41d4-a716-446655440001',
    chain: 'bnb' as const,
    address: '0x1234567890123456789012345678901234567890',
    derivationPath: "m/44'/0'/0'/0/0",
    derivationIndex: 0,
    tier: 'hot' as const,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const validWithBalance = {
    ...baseAddress,
    balance: {
      USDT: '1000000',
      USDC: '2000000',
    },
    cached: true,
  };

  it('parses valid address with balance', () => {
    const result = UserAddressWithBalance.safeParse(validWithBalance);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.balance?.USDT).toBe('1000000');
      expect(result.data.cached).toBe(true);
    }
  });

  it('accepts null balance', () => {
    const result = UserAddressWithBalance.safeParse({
      ...baseAddress,
      balance: null,
      cached: false,
    });
    expect(result.success).toBe(true);
  });

  it('requires cached field', () => {
    const result = UserAddressWithBalance.safeParse({
      ...baseAddress,
      balance: null,
    });
    expect(result.success).toBe(false);
  });
});

describe('UserBalance', () => {
  it('parses valid balance', () => {
    const result = UserBalance.safeParse({
      USDT: '1000000',
      USDC: '2000000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero balance', () => {
    const result = UserBalance.safeParse({
      USDT: '0',
      USDC: '0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects null USDT', () => {
    const result = UserBalance.safeParse({
      USDT: null,
      USDC: '2000000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects null USDC', () => {
    const result = UserBalance.safeParse({
      USDT: '1000000',
      USDC: null,
    });
    expect(result.success).toBe(false);
  });

  it('requires both fields', () => {
    const result = UserBalance.safeParse({
      USDT: '1000000',
    });
    expect(result.success).toBe(false);
  });
});

describe('DerivedAddress', () => {
  const validDerived = {
    chain: 'bnb' as const,
    address: '0x1234567890123456789012345678901234567890',
    derivationPath: "m/44'/0'/0'/0/0",
    derivationIndex: 0,
  };

  it('parses valid derived address', () => {
    const result = DerivedAddress.safeParse(validDerived);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.chain).toBe('bnb');
      expect(result.data.derivationIndex).toBe(0);
    }
  });

  it('rejects negative derivationIndex', () => {
    const result = DerivedAddress.safeParse({
      ...validDerived,
      derivationIndex: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts large derivationIndex', () => {
    const result = DerivedAddress.safeParse({
      ...validDerived,
      derivationIndex: 1000000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid chain', () => {
    const result = DerivedAddress.safeParse({
      ...validDerived,
      chain: 'eth',
    });
    expect(result.success).toBe(false);
  });
});
