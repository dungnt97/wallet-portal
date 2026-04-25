import { describe, expect, it } from 'vitest';
import { Withdrawal, WithdrawalStatus } from '../withdrawal.js';

describe('WithdrawalStatus', () => {
  it('accepts all valid statuses', () => {
    const statuses = [
      'pending',
      'approved',
      'time_locked',
      'executing',
      'broadcast',
      'cancelling',
      'completed',
      'cancelled',
      'failed',
    ];
    for (const status of statuses) {
      const result = WithdrawalStatus.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = WithdrawalStatus.safeParse('pending_review');
    expect(result.success).toBe(false);
  });
});

describe('Withdrawal', () => {
  const validWithdrawal = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: '550e8400-e29b-41d4-a716-446655440001',
    chain: 'bnb' as const,
    token: 'USDT' as const,
    amount: '500000.50',
    destinationAddr: '0x1234567890123456789012345678901234567890',
    status: 'approved' as const,
    sourceTier: 'hot' as const,
    multisigOpId: '550e8400-e29b-41d4-a716-446655440002',
    timeLockExpiresAt: '2026-01-02T00:00:00Z',
    createdBy: '550e8400-e29b-41d4-a716-446655440003',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T01:00:00Z',
  };

  it('parses valid withdrawal', () => {
    const result = Withdrawal.safeParse(validWithdrawal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('approved');
      expect(result.data.sourceTier).toBe('hot');
      expect(result.data.token).toBe('USDT');
    }
  });

  it('accepts integer amount without decimals', () => {
    const result = Withdrawal.safeParse({
      ...validWithdrawal,
      amount: '500000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts amount with decimals', () => {
    const result = Withdrawal.safeParse({
      ...validWithdrawal,
      amount: '500000.123456',
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero amount', () => {
    const result = Withdrawal.safeParse({
      ...validWithdrawal,
      amount: '0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative amount', () => {
    const result = Withdrawal.safeParse({
      ...validWithdrawal,
      amount: '-1000',
    });
    expect(result.success).toBe(false);
  });

  it('accepts null multisigOpId', () => {
    const result = Withdrawal.safeParse({
      ...validWithdrawal,
      multisigOpId: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null timeLockExpiresAt', () => {
    const result = Withdrawal.safeParse({
      ...validWithdrawal,
      timeLockExpiresAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid statuses', () => {
    const statuses = [
      'pending',
      'approved',
      'time_locked',
      'executing',
      'broadcast',
      'cancelling',
      'completed',
      'cancelled',
      'failed',
    ];
    for (const status of statuses) {
      const result = Withdrawal.safeParse({
        ...validWithdrawal,
        status: status as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid chains', () => {
    for (const chain of ['bnb', 'sol']) {
      const result = Withdrawal.safeParse({
        ...validWithdrawal,
        chain: chain as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid tokens', () => {
    for (const token of ['USDT', 'USDC']) {
      const result = Withdrawal.safeParse({
        ...validWithdrawal,
        token: token as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid source tiers', () => {
    for (const tier of ['hot', 'cold']) {
      const result = Withdrawal.safeParse({
        ...validWithdrawal,
        sourceTier: tier as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid chain', () => {
    const result = Withdrawal.safeParse({
      ...validWithdrawal,
      chain: 'eth',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid token', () => {
    const result = Withdrawal.safeParse({
      ...validWithdrawal,
      token: 'DOGE',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid source tier', () => {
    const result = Withdrawal.safeParse({
      ...validWithdrawal,
      sourceTier: 'warm',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid amount format', () => {
    const result = Withdrawal.safeParse({
      ...validWithdrawal,
      amount: 'abc',
    });
    expect(result.success).toBe(false);
  });
});
