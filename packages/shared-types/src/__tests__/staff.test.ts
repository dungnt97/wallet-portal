import { describe, expect, it } from 'vitest';
import { StaffMember, StaffSigningKey, StaffStatus, WalletType } from '../staff.js';

describe('StaffStatus', () => {
  it('accepts all valid statuses', () => {
    const statuses = ['active', 'suspended', 'offboarded'];
    for (const status of statuses) {
      const result = StaffStatus.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = StaffStatus.safeParse('inactive');
    expect(result.success).toBe(false);
  });
});

describe('StaffMember', () => {
  const validMember = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'john@example.com',
    name: 'John Doe',
    role: 'admin' as const,
    status: 'active' as const,
    lastLoginAt: '2026-01-01T00:00:00Z',
    createdAt: '2025-12-01T00:00:00Z',
  };

  it('parses valid staff member', () => {
    const result = StaffMember.safeParse(validMember);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('admin');
      expect(result.data.status).toBe('active');
    }
  });

  it('accepts null lastLoginAt', () => {
    const result = StaffMember.safeParse({
      ...validMember,
      lastLoginAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = StaffMember.safeParse({
      ...validMember,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = StaffMember.safeParse({
      ...validMember,
      role: 'superadmin',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid roles', () => {
    const roles = ['admin', 'treasurer', 'operator', 'viewer'];
    for (const role of roles) {
      const result = StaffMember.safeParse({
        ...validMember,
        role: role as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid statuses', () => {
    const statuses = ['active', 'suspended', 'offboarded'];
    for (const status of statuses) {
      const result = StaffMember.safeParse({
        ...validMember,
        status: status as any,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('WalletType', () => {
  it('accepts all valid wallet types', () => {
    const types = ['metamask', 'phantom', 'ledger', 'other'];
    for (const type of types) {
      const result = WalletType.safeParse(type);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid wallet type', () => {
    const result = WalletType.safeParse('trezor');
    expect(result.success).toBe(false);
  });
});

describe('StaffSigningKey', () => {
  const validKey = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    staffId: '550e8400-e29b-41d4-a716-446655440001',
    chain: 'bnb' as const,
    address: '0x1234567890123456789012345678901234567890',
    tier: 'hot' as const,
    walletType: 'ledger' as const,
    hwAttested: true,
    registeredAt: '2025-12-01T00:00:00Z',
    revokedAt: null,
  };

  it('parses valid signing key', () => {
    const result = StaffSigningKey.safeParse(validKey);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.walletType).toBe('ledger');
      expect(result.data.hwAttested).toBe(true);
    }
  });

  it('accepts null revokedAt', () => {
    const result = StaffSigningKey.safeParse({
      ...validKey,
      revokedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts non-null revokedAt', () => {
    const result = StaffSigningKey.safeParse({
      ...validKey,
      revokedAt: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts hwAttested false', () => {
    const result = StaffSigningKey.safeParse({
      ...validKey,
      hwAttested: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid wallet types', () => {
    const types = ['metamask', 'phantom', 'ledger', 'other'];
    for (const type of types) {
      const result = StaffSigningKey.safeParse({
        ...validKey,
        walletType: type as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid chains', () => {
    for (const chain of ['bnb', 'sol']) {
      const result = StaffSigningKey.safeParse({
        ...validKey,
        chain: chain as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid tiers', () => {
    for (const tier of ['hot', 'cold']) {
      const result = StaffSigningKey.safeParse({
        ...validKey,
        tier: tier as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid chain', () => {
    const result = StaffSigningKey.safeParse({
      ...validKey,
      chain: 'eth',
    });
    expect(result.success).toBe(false);
  });
});
