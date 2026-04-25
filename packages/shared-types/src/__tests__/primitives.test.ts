import { describe, expect, it } from 'vitest';
import { Chain, Role, Tier, Token } from '../primitives.js';

describe('Chain', () => {
  it('accepts valid chains', () => {
    const validChains = ['bnb', 'sol'];
    for (const chain of validChains) {
      const result = Chain.safeParse(chain);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(chain);
      }
    }
  });

  it('rejects invalid chain', () => {
    const result = Chain.safeParse('eth');
    expect(result.success).toBe(false);
  });

  it('rejects case mismatch', () => {
    const result = Chain.safeParse('BNB');
    expect(result.success).toBe(false);
  });
});

describe('Token', () => {
  it('accepts valid tokens', () => {
    const validTokens = ['USDT', 'USDC'];
    for (const token of validTokens) {
      const result = Token.safeParse(token);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(token);
      }
    }
  });

  it('rejects invalid token', () => {
    const result = Token.safeParse('USDE');
    expect(result.success).toBe(false);
  });

  it('rejects lowercase', () => {
    const result = Token.safeParse('usdt');
    expect(result.success).toBe(false);
  });
});

describe('Tier', () => {
  it('accepts valid tiers', () => {
    const validTiers = ['hot', 'cold'];
    for (const tier of validTiers) {
      const result = Tier.safeParse(tier);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(tier);
      }
    }
  });

  it('rejects invalid tier', () => {
    const result = Tier.safeParse('warm');
    expect(result.success).toBe(false);
  });

  it('rejects case mismatch', () => {
    const result = Tier.safeParse('HOT');
    expect(result.success).toBe(false);
  });
});

describe('Role', () => {
  it('accepts all valid roles', () => {
    const validRoles = ['admin', 'treasurer', 'operator', 'viewer'];
    for (const role of validRoles) {
      const result = Role.safeParse(role);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(role);
      }
    }
  });

  it('rejects invalid role', () => {
    const result = Role.safeParse('moderator');
    expect(result.success).toBe(false);
  });

  it('rejects case mismatch', () => {
    const result = Role.safeParse('ADMIN');
    expect(result.success).toBe(false);
  });
});
