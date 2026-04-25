import { describe, expect, it } from 'vitest';
import { MultisigOp, MultisigOpStatus } from '../multisig.js';

describe('MultisigOpStatus', () => {
  it('accepts all valid statuses', () => {
    const statuses = [
      'pending',
      'collecting',
      'ready',
      'submitted',
      'confirmed',
      'expired',
      'failed',
    ];
    for (const status of statuses) {
      const result = MultisigOpStatus.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = MultisigOpStatus.safeParse('cancelled');
    expect(result.success).toBe(false);
  });
});

describe('MultisigOp', () => {
  const validOp = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    withdrawalId: '550e8400-e29b-41d4-a716-446655440001',
    chain: 'bnb' as const,
    operationType: 'transfer',
    multisigAddr: '0x1234567890123456789012345678901234567890',
    requiredSigs: 2,
    collectedSigs: 1,
    totalSigners: 3,
    expiresAt: '2026-01-02T00:00:00Z',
    status: 'collecting' as const,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T01:00:00Z',
    withdrawalAmount: '1000000',
    withdrawalToken: 'USDT',
    withdrawalDestination: '0x0987654321098765432109876543210987654321',
    withdrawalNonce: 5,
  };

  it('parses valid multisig op', () => {
    const result = MultisigOp.safeParse(validOp);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('collecting');
      expect(result.data.requiredSigs).toBe(2);
    }
  });

  it('accepts null withdrawalId', () => {
    const result = MultisigOp.safeParse({
      ...validOp,
      withdrawalId: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero collectedSigs', () => {
    const result = MultisigOp.safeParse({
      ...validOp,
      collectedSigs: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects zero requiredSigs', () => {
    const result = MultisigOp.safeParse({
      ...validOp,
      requiredSigs: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative collectedSigs', () => {
    const result = MultisigOp.safeParse({
      ...validOp,
      collectedSigs: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional totalSigners', () => {
    const result = MultisigOp.safeParse({
      ...validOp,
      totalSigners: 5,
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero totalSigners', () => {
    const result = MultisigOp.safeParse({
      ...validOp,
      totalSigners: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null withdrawalAmount', () => {
    const result = MultisigOp.safeParse({
      ...validOp,
      withdrawalAmount: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null withdrawalToken', () => {
    const result = MultisigOp.safeParse({
      ...validOp,
      withdrawalToken: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null withdrawalDestination', () => {
    const result = MultisigOp.safeParse({
      ...validOp,
      withdrawalDestination: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null withdrawalNonce', () => {
    const result = MultisigOp.safeParse({
      ...validOp,
      withdrawalNonce: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid statuses', () => {
    const statuses = [
      'pending',
      'collecting',
      'ready',
      'submitted',
      'confirmed',
      'expired',
      'failed',
    ];
    for (const status of statuses) {
      const result = MultisigOp.safeParse({
        ...validOp,
        status: status as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid chain', () => {
    const result = MultisigOp.safeParse({
      ...validOp,
      chain: 'eth',
    });
    expect(result.success).toBe(false);
  });
});
