import { describe, expect, it } from 'vitest';
import { Deposit, DepositStatus } from '../deposit.js';

describe('DepositStatus', () => {
  it('accepts all valid statuses', () => {
    const statuses = ['pending', 'credited', 'swept', 'failed'];
    for (const status of statuses) {
      const result = DepositStatus.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = DepositStatus.safeParse('confirmed');
    expect(result.success).toBe(false);
  });
});

describe('Deposit', () => {
  const validDeposit = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: '550e8400-e29b-41d4-a716-446655440001',
    chain: 'bnb' as const,
    token: 'USDT' as const,
    amount: '1000000.50',
    status: 'credited' as const,
    confirmedBlocks: 12,
    txHash: '0x1234567890abcdef',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:05:00Z',
  };

  it('parses valid deposit', () => {
    const result = Deposit.safeParse(validDeposit);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('credited');
      expect(result.data.token).toBe('USDT');
    }
  });

  it('accepts integer amount without decimals', () => {
    const result = Deposit.safeParse({
      ...validDeposit,
      amount: '1000000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts amount with decimals', () => {
    const result = Deposit.safeParse({
      ...validDeposit,
      amount: '1000000.123456',
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero amount', () => {
    const result = Deposit.safeParse({
      ...validDeposit,
      amount: '0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative amount', () => {
    const result = Deposit.safeParse({
      ...validDeposit,
      amount: '-1000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects amount with invalid format', () => {
    const result = Deposit.safeParse({
      ...validDeposit,
      amount: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('accepts zero confirmedBlocks', () => {
    const result = Deposit.safeParse({
      ...validDeposit,
      confirmedBlocks: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative confirmedBlocks', () => {
    const result = Deposit.safeParse({
      ...validDeposit,
      confirmedBlocks: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts null txHash', () => {
    const result = Deposit.safeParse({
      ...validDeposit,
      txHash: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid chain', () => {
    const result = Deposit.safeParse({
      ...validDeposit,
      chain: 'eth',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid token', () => {
    const result = Deposit.safeParse({
      ...validDeposit,
      token: 'DOGE',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid statuses', () => {
    const statuses = ['pending', 'credited', 'swept', 'failed'];
    for (const status of statuses) {
      const result = Deposit.safeParse({
        ...validDeposit,
        status: status as any,
      });
      expect(result.success).toBe(true);
    }
  });
});
