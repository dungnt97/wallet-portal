import { describe, expect, it } from 'vitest';
import {
  BumpTxRequest,
  BumpTxResponse,
  CancelTxRequest,
  CancelTxResponse,
  RecoveryAction,
  RecoveryActionStatus,
  RecoveryActionType,
  RecoveryEntityType,
  StuckTxItem,
  StuckTxListResponse,
} from '../recovery.js';

describe('RecoveryEntityType', () => {
  it('accepts all valid entity types', () => {
    const types = ['withdrawal', 'sweep'];
    for (const type of types) {
      const result = RecoveryEntityType.safeParse(type);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid entity type', () => {
    const result = RecoveryEntityType.safeParse('deposit');
    expect(result.success).toBe(false);
  });
});

describe('RecoveryActionType', () => {
  it('accepts all valid action types', () => {
    const types = ['bump', 'cancel'];
    for (const type of types) {
      const result = RecoveryActionType.safeParse(type);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid action type', () => {
    const result = RecoveryActionType.safeParse('replace');
    expect(result.success).toBe(false);
  });
});

describe('RecoveryActionStatus', () => {
  it('accepts all valid statuses', () => {
    const statuses = ['pending', 'broadcast', 'confirmed', 'failed'];
    for (const status of statuses) {
      const result = RecoveryActionStatus.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = RecoveryActionStatus.safeParse('cancelled');
    expect(result.success).toBe(false);
  });
});

describe('StuckTxItem', () => {
  const validItem = {
    entityType: 'withdrawal' as const,
    entityId: '550e8400-e29b-41d4-a716-446655440000',
    chain: 'bnb' as const,
    txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    broadcastAt: '2026-01-01T00:00:00Z',
    ageSeconds: 3600,
    bumpCount: 2,
    lastBumpAt: '2026-01-01T01:00:00Z',
    canBump: true,
    canCancel: true,
  };

  it('parses valid stuck tx item', () => {
    const result = StuckTxItem.safeParse(validItem);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entityType).toBe('withdrawal');
      expect(result.data.bumpCount).toBe(2);
      expect(result.data.canBump).toBe(true);
    }
  });

  it('accepts null lastBumpAt', () => {
    const result = StuckTxItem.safeParse({
      ...validItem,
      lastBumpAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero ageSeconds', () => {
    const result = StuckTxItem.safeParse({
      ...validItem,
      ageSeconds: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero bumpCount', () => {
    const result = StuckTxItem.safeParse({
      ...validItem,
      bumpCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts any integer ageSeconds', () => {
    const result = StuckTxItem.safeParse({
      ...validItem,
      ageSeconds: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts any integer bumpCount', () => {
    const result = StuckTxItem.safeParse({
      ...validItem,
      bumpCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid entity types', () => {
    for (const type of ['withdrawal', 'sweep']) {
      const result = StuckTxItem.safeParse({
        ...validItem,
        // biome-ignore lint/suspicious/noExplicitAny: passing string values through Zod safeParse to test enum acceptance
        entityType: type as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid chains', () => {
    for (const chain of ['bnb', 'sol']) {
      const result = StuckTxItem.safeParse({
        ...validItem,
        // biome-ignore lint/suspicious/noExplicitAny: passing string values through Zod safeParse to test enum acceptance
        chain: chain as any,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('StuckTxListResponse', () => {
  const validItem = {
    entityType: 'withdrawal' as const,
    entityId: '550e8400-e29b-41d4-a716-446655440000',
    chain: 'bnb' as const,
    txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    broadcastAt: '2026-01-01T00:00:00Z',
    ageSeconds: 3600,
    bumpCount: 0,
    lastBumpAt: null,
    canBump: true,
    canCancel: true,
  };

  const validResponse = {
    items: [validItem],
    thresholdsUsed: {
      evmMinutes: 2,
      solanaSeconds: 30,
    },
  };

  it('parses valid response', () => {
    const result = StuckTxListResponse.safeParse(validResponse);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBe(1);
      expect(result.data.thresholdsUsed.evmMinutes).toBe(2);
    }
  });

  it('accepts empty items array', () => {
    const result = StuckTxListResponse.safeParse({
      ...validResponse,
      items: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('BumpTxRequest', () => {
  it('parses valid request', () => {
    const result = BumpTxRequest.safeParse({
      idempotencyKey: 'bump-tx-001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts long idempotency key (up to 128 chars)', () => {
    const longKey = 'x'.repeat(128);
    const result = BumpTxRequest.safeParse({
      idempotencyKey: longKey,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty idempotency key', () => {
    const result = BumpTxRequest.safeParse({
      idempotencyKey: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects idempotency key exceeding 128 chars', () => {
    const longKey = 'x'.repeat(129);
    const result = BumpTxRequest.safeParse({
      idempotencyKey: longKey,
    });
    expect(result.success).toBe(false);
  });
});

describe('BumpTxResponse', () => {
  const validResponse = {
    ok: true,
    actionId: '550e8400-e29b-41d4-a716-446655440000',
    newTxHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    bumpCount: 3,
  };

  it('parses valid response', () => {
    const result = BumpTxResponse.safeParse(validResponse);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ok).toBe(true);
      expect(result.data.bumpCount).toBe(3);
    }
  });

  it('requires ok to be true', () => {
    const result = BumpTxResponse.safeParse({
      ...validResponse,
      ok: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer bumpCount', () => {
    const result = BumpTxResponse.safeParse({
      ...validResponse,
      bumpCount: 3.5,
    });
    expect(result.success).toBe(false);
  });

  it('accepts zero bumpCount', () => {
    const result = BumpTxResponse.safeParse({
      ...validResponse,
      bumpCount: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe('CancelTxRequest', () => {
  it('parses valid request', () => {
    const result = CancelTxRequest.safeParse({
      idempotencyKey: 'cancel-tx-001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts long idempotency key (up to 128 chars)', () => {
    const longKey = 'y'.repeat(128);
    const result = CancelTxRequest.safeParse({
      idempotencyKey: longKey,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty idempotency key', () => {
    const result = CancelTxRequest.safeParse({
      idempotencyKey: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('CancelTxResponse', () => {
  const validResponse = {
    ok: true,
    actionId: '550e8400-e29b-41d4-a716-446655440000',
    cancelTxHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  };

  it('parses valid response', () => {
    const result = CancelTxResponse.safeParse(validResponse);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ok).toBe(true);
    }
  });

  it('requires ok to be true', () => {
    const result = CancelTxResponse.safeParse({
      ...validResponse,
      ok: false,
    });
    expect(result.success).toBe(false);
  });
});

describe('RecoveryAction', () => {
  const validAction = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    idempotencyKey: 'recovery-action-001',
    actionType: 'bump' as const,
    entityType: 'withdrawal' as const,
    entityId: '550e8400-e29b-41d4-a716-446655440001',
    chain: 'bnb' as const,
    originalTxHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    newTxHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    gasPriceGwei: '15.5',
    status: 'broadcast' as const,
    initiatedBy: '550e8400-e29b-41d4-a716-446655440002',
    errorMessage: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T01:00:00Z',
  };

  it('parses valid recovery action', () => {
    const result = RecoveryAction.safeParse(validAction);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actionType).toBe('bump');
      expect(result.data.status).toBe('broadcast');
    }
  });

  it('accepts null newTxHash', () => {
    const result = RecoveryAction.safeParse({
      ...validAction,
      newTxHash: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null gasPriceGwei', () => {
    const result = RecoveryAction.safeParse({
      ...validAction,
      gasPriceGwei: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null errorMessage', () => {
    const result = RecoveryAction.safeParse({
      ...validAction,
      errorMessage: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null updatedAt', () => {
    const result = RecoveryAction.safeParse({
      ...validAction,
      updatedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid action types', () => {
    for (const type of ['bump', 'cancel']) {
      const result = RecoveryAction.safeParse({
        ...validAction,
        // biome-ignore lint/suspicious/noExplicitAny: passing string values through Zod safeParse to test enum acceptance
        actionType: type as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid entity types', () => {
    for (const type of ['withdrawal', 'sweep']) {
      const result = RecoveryAction.safeParse({
        ...validAction,
        // biome-ignore lint/suspicious/noExplicitAny: passing string values through Zod safeParse to test enum acceptance
        entityType: type as any,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid statuses', () => {
    for (const status of ['pending', 'broadcast', 'confirmed', 'failed']) {
      const result = RecoveryAction.safeParse({
        ...validAction,
        // biome-ignore lint/suspicious/noExplicitAny: passing string values through Zod safeParse to test enum acceptance
        status: status as any,
      });
      expect(result.success).toBe(true);
    }
  });
});
