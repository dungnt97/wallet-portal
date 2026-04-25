import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '../ledger.js';

describe('LedgerEntry', () => {
  const validEntry = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    txId: '550e8400-e29b-41d4-a716-446655440001',
    account: 'user:550e8400-e29b-41d4-a716-446655440002',
    debit: '1000000',
    credit: '0',
    currency: 'USDT' as const,
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('parses valid ledger entry', () => {
    const result = LedgerEntry.safeParse(validEntry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('USDT');
      expect(result.data.account).toBe('user:550e8400-e29b-41d4-a716-446655440002');
    }
  });

  it('accepts debit with decimals', () => {
    const result = LedgerEntry.safeParse({
      ...validEntry,
      debit: '1000000.50',
    });
    expect(result.success).toBe(true);
  });

  it('accepts credit with decimals', () => {
    const result = LedgerEntry.safeParse({
      ...validEntry,
      credit: '1000000.75',
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero debit', () => {
    const result = LedgerEntry.safeParse({
      ...validEntry,
      debit: '0',
      credit: '1000000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero credit', () => {
    const result = LedgerEntry.safeParse({
      ...validEntry,
      debit: '1000000',
      credit: '0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative debit', () => {
    const result = LedgerEntry.safeParse({
      ...validEntry,
      debit: '-1000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative credit', () => {
    const result = LedgerEntry.safeParse({
      ...validEntry,
      credit: '-1000',
    });
    expect(result.success).toBe(false);
  });

  it('accepts various account formats', () => {
    const accounts = ['user:xxx', 'hot_safe', 'cold_reserve', 'fee', 'system:sweep'];
    for (const account of accounts) {
      const result = LedgerEntry.safeParse({
        ...validEntry,
        account,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid currencies', () => {
    const currencies = ['USDT', 'USDC'];
    for (const currency of currencies) {
      const result = LedgerEntry.safeParse({
        ...validEntry,
        currency: currency as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid currency', () => {
    const result = LedgerEntry.safeParse({
      ...validEntry,
      currency: 'DOGE',
    });
    expect(result.success).toBe(false);
  });

  it('rejects debit with invalid format', () => {
    const result = LedgerEntry.safeParse({
      ...validEntry,
      debit: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects credit with invalid format', () => {
    const result = LedgerEntry.safeParse({
      ...validEntry,
      credit: 'abc',
    });
    expect(result.success).toBe(false);
  });
});
