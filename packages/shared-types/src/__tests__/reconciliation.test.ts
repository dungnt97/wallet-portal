import { describe, expect, it } from 'vitest';
import {
  DriftSeverity,
  ReconciliationDrift,
  ReconciliationSnapshot,
  RunSnapshotBody,
  SnapshotDetailResponse,
  SnapshotListResponse,
  SnapshotScope,
  SnapshotStatus,
} from '../reconciliation.js';

describe('SnapshotStatus', () => {
  it('accepts all valid statuses', () => {
    const statuses = ['running', 'completed', 'failed', 'cancelled'];
    for (const status of statuses) {
      const result = SnapshotStatus.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = SnapshotStatus.safeParse('pending');
    expect(result.success).toBe(false);
  });
});

describe('SnapshotScope', () => {
  it('accepts all valid scopes', () => {
    const scopes = ['all', 'hot', 'cold', 'users'];
    for (const scope of scopes) {
      const result = SnapshotScope.safeParse(scope);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid scope', () => {
    const result = SnapshotScope.safeParse('partial');
    expect(result.success).toBe(false);
  });
});

describe('ReconciliationSnapshot', () => {
  const validSnapshot = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    createdAt: '2026-01-01T00:00:00Z',
    triggeredBy: '550e8400-e29b-41d4-a716-446655440001',
    status: 'completed' as const,
    chain: 'bnb',
    scope: 'all' as const,
    onChainTotalMinor: '1000000',
    ledgerTotalMinor: '1000000',
    driftTotalMinor: '0',
    errorMessage: null,
    completedAt: '2026-01-01T00:05:00Z',
  };

  it('parses valid snapshot', () => {
    const result = ReconciliationSnapshot.safeParse(validSnapshot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('completed');
      expect(result.data.scope).toBe('all');
    }
  });

  it('accepts null triggeredBy', () => {
    const result = ReconciliationSnapshot.safeParse({
      ...validSnapshot,
      triggeredBy: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null chain', () => {
    const result = ReconciliationSnapshot.safeParse({
      ...validSnapshot,
      chain: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null totals and drift', () => {
    const result = ReconciliationSnapshot.safeParse({
      ...validSnapshot,
      onChainTotalMinor: null,
      ledgerTotalMinor: null,
      driftTotalMinor: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null errorMessage', () => {
    const result = ReconciliationSnapshot.safeParse({
      ...validSnapshot,
      errorMessage: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null completedAt', () => {
    const result = ReconciliationSnapshot.safeParse({
      ...validSnapshot,
      completedAt: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('DriftSeverity', () => {
  it('accepts all valid severities', () => {
    const severities = ['info', 'warning', 'critical'];
    for (const severity of severities) {
      const result = DriftSeverity.safeParse(severity);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid severity', () => {
    const result = DriftSeverity.safeParse('high');
    expect(result.success).toBe(false);
  });
});

describe('ReconciliationDrift', () => {
  const validDrift = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    snapshotId: '550e8400-e29b-41d4-a716-446655440001',
    chain: 'bnb',
    token: 'USDT',
    address: '0x1234567890123456789012345678901234567890',
    accountLabel: 'hot-wallet-1',
    onChainMinor: '1000000',
    ledgerMinor: '900000',
    driftMinor: '100000',
    severity: 'critical' as const,
    suppressedReason: null,
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('parses valid drift', () => {
    const result = ReconciliationDrift.safeParse(validDrift);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.severity).toBe('critical');
      expect(result.data.chain).toBe('bnb');
    }
  });

  it('accepts null suppressedReason', () => {
    const result = ReconciliationDrift.safeParse({
      ...validDrift,
      suppressedReason: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts non-null suppressedReason', () => {
    const result = ReconciliationDrift.safeParse({
      ...validDrift,
      suppressedReason: 'known issue',
    });
    expect(result.success).toBe(true);
  });
});

describe('RunSnapshotBody', () => {
  it('parses valid request', () => {
    const result = RunSnapshotBody.safeParse({
      chain: 'bnb',
      scope: 'hot',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = RunSnapshotBody.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts only chain', () => {
    const result = RunSnapshotBody.safeParse({ chain: 'sol' });
    expect(result.success).toBe(true);
  });

  it('accepts only scope', () => {
    const result = RunSnapshotBody.safeParse({ scope: 'all' });
    expect(result.success).toBe(true);
  });

  it('accepts all valid chains', () => {
    for (const chain of ['bnb', 'sol']) {
      const result = RunSnapshotBody.safeParse({ chain });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid chain', () => {
    const result = RunSnapshotBody.safeParse({ chain: 'eth' });
    expect(result.success).toBe(false);
  });
});

describe('SnapshotListResponse', () => {
  const validSnapshot = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    createdAt: '2026-01-01T00:00:00Z',
    triggeredBy: null,
    status: 'completed' as const,
    chain: null,
    scope: 'all' as const,
    onChainTotalMinor: null,
    ledgerTotalMinor: null,
    driftTotalMinor: null,
    errorMessage: null,
    completedAt: null,
  };

  const validResponse = {
    data: [validSnapshot],
    total: 50,
    page: 1,
  };

  it('parses valid response', () => {
    const result = SnapshotListResponse.safeParse(validResponse);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total).toBe(50);
      expect(result.data.data.length).toBe(1);
    }
  });

  it('accepts empty data', () => {
    const result = SnapshotListResponse.safeParse({
      ...validResponse,
      data: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('SnapshotDetailResponse', () => {
  const validSnapshot = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    createdAt: '2026-01-01T00:00:00Z',
    triggeredBy: null,
    status: 'completed' as const,
    chain: null,
    scope: 'all' as const,
    onChainTotalMinor: null,
    ledgerTotalMinor: null,
    driftTotalMinor: null,
    errorMessage: null,
    completedAt: null,
  };

  const validDrift = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    snapshotId: '550e8400-e29b-41d4-a716-446655440000',
    chain: 'bnb',
    token: 'USDT',
    address: '0x1234567890123456789012345678901234567890',
    accountLabel: 'test',
    onChainMinor: '100',
    ledgerMinor: '100',
    driftMinor: '0',
    severity: 'info' as const,
    suppressedReason: null,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const validResponse = {
    snapshot: validSnapshot,
    drifts: [validDrift],
  };

  it('parses valid response', () => {
    const result = SnapshotDetailResponse.safeParse(validResponse);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.drifts.length).toBe(1);
    }
  });

  it('accepts empty drifts', () => {
    const result = SnapshotDetailResponse.safeParse({
      ...validResponse,
      drifts: [],
    });
    expect(result.success).toBe(true);
  });
});
