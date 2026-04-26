import { beforeEach, describe, expect, it, vi } from 'vitest';
// Tests for dashboard-history.service.ts
// getDashboardHistory: dispatches to fetchAumHistory, fetchDepositsHistory, fetchWithdrawalsHistory
// Each fetcher calls db.execute with raw SQL and maps the result rows.

function makeDb(rows1: unknown[], rows2: unknown[] = []) {
  let callN = 0;
  return {
    execute: vi.fn(() => {
      callN++;
      if (callN === 1) return Promise.resolve(rows1);
      return Promise.resolve(rows2);
    }),
  };
}

describe('getDashboardHistory — aum', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns metric=aum with cumulative points', async () => {
    // rows1 = delta buckets; rows2 = prior sum
    const bucketRows = [
      { bucket: '2026-01-15T09:00:00Z', delta: '500' },
      { bucket: '2026-01-15T10:00:00Z', delta: '300' },
    ];
    const priorRow = { prior: '200' };
    const db = makeDb(bucketRows, [priorRow]);

    const { getDashboardHistory } = await import('../services/dashboard-history.service.js');
    const result = await getDashboardHistory(db as never, 'aum', '24h');

    expect(result.metric).toBe('aum');
    expect(result.range).toBe('24h');
    expect(result.points).toHaveLength(2);
    // cumulative: 200 + 500 = 700, then 700 + 300 = 1000
    expect(result.points[0].v).toBe(700);
    expect(result.points[1].v).toBe(1000);
    expect(typeof result.points[0].t).toBe('string');
  });

  it('clamps negative cumulative to 0', async () => {
    const bucketRows = [{ bucket: '2026-01-15T09:00:00Z', delta: '-100' }];
    const priorRow = { prior: '50' };
    const db = makeDb(bucketRows, [priorRow]);

    const { getDashboardHistory } = await import('../services/dashboard-history.service.js');
    const result = await getDashboardHistory(db as never, 'aum', '24h');
    // cumulative: 50 + (-100) = -50 → clamped to 0
    expect(result.points[0].v).toBe(0);
  });

  it('returns empty points when no delta rows', async () => {
    const db = makeDb([], [{ prior: '0' }]);
    const { getDashboardHistory } = await import('../services/dashboard-history.service.js');
    const result = await getDashboardHistory(db as never, 'aum', '7d');
    expect(result.points).toHaveLength(0);
  });

  it('uses prior=0 when prior row is missing', async () => {
    const bucketRows = [{ bucket: '2026-01-15T09:00:00Z', delta: '400' }];
    const db = makeDb(bucketRows, [{}]);
    const { getDashboardHistory } = await import('../services/dashboard-history.service.js');
    const result = await getDashboardHistory(db as never, 'aum', '30d');
    expect(result.points[0].v).toBe(400);
  });
});

describe('getDashboardHistory — deposits', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns metric=deposits with count per bucket', async () => {
    const bucketRows = [
      { bucket: '2026-01-15T09:00:00Z', cnt: '15' },
      { bucket: '2026-01-15T10:00:00Z', cnt: '8' },
    ];
    const db = { execute: vi.fn().mockResolvedValue(bucketRows) };

    const { getDashboardHistory } = await import('../services/dashboard-history.service.js');
    const result = await getDashboardHistory(db as never, 'deposits', '24h');

    expect(result.metric).toBe('deposits');
    expect(result.points).toHaveLength(2);
    expect(result.points[0].v).toBe(15);
    expect(result.points[1].v).toBe(8);
  });

  it('returns empty points when no deposits in range', async () => {
    const db = { execute: vi.fn().mockResolvedValue([]) };
    const { getDashboardHistory } = await import('../services/dashboard-history.service.js');
    const result = await getDashboardHistory(db as never, 'deposits', '90d');
    expect(result.points).toHaveLength(0);
  });

  it('handles null cnt gracefully (defaults to 0)', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue([{ bucket: '2026-01-15T09:00:00Z', cnt: null }]),
    };
    const { getDashboardHistory } = await import('../services/dashboard-history.service.js');
    const result = await getDashboardHistory(db as never, 'deposits', '7d');
    expect(result.points[0].v).toBe(0);
  });
});

describe('getDashboardHistory — withdrawals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns metric=withdrawals with count per bucket', async () => {
    const bucketRows = [{ bucket: '2026-01-15T09:00:00Z', cnt: '3' }];
    const db = { execute: vi.fn().mockResolvedValue(bucketRows) };

    const { getDashboardHistory } = await import('../services/dashboard-history.service.js');
    const result = await getDashboardHistory(db as never, 'withdrawals', '24h');

    expect(result.metric).toBe('withdrawals');
    expect(result.points).toHaveLength(1);
    expect(result.points[0].v).toBe(3);
  });

  it('returns empty points for withdrawals when no data', async () => {
    const db = { execute: vi.fn().mockResolvedValue([]) };
    const { getDashboardHistory } = await import('../services/dashboard-history.service.js');
    const result = await getDashboardHistory(db as never, 'withdrawals', '30d');
    expect(result.points).toHaveLength(0);
  });
});
