import { describe, expect, it } from 'vitest';
import { GAS_HISTORY_QUERY_KEY, type GasHistoryData, type GasPoint } from '../use-gas-history';

describe('useGasHistory types and query key', () => {
  it('creates correct query key for BNB chain', () => {
    const key = GAS_HISTORY_QUERY_KEY('bnb');
    expect(key).toEqual(['chain', 'gas-history', 'bnb']);
  });

  it('creates correct query key for SOL chain', () => {
    const key = GAS_HISTORY_QUERY_KEY('sol');
    expect(key).toEqual(['chain', 'gas-history', 'sol']);
  });

  it('supports GasPoint type with ISO timestamp and price', () => {
    const point: GasPoint = {
      t: '2026-04-25T10:00:00Z',
      price: 3.5,
    };
    expect(point.t).toBeDefined();
    expect(point.price).toBeDefined();
  });

  it('supports GasHistoryData type with nullable statistics', () => {
    const data: GasHistoryData = {
      points: [
        { t: '2026-04-25T10:00:00Z', price: 3.5 },
        { t: '2026-04-25T11:00:00Z', price: 3.6 },
      ],
      current: 3.7,
      avg: 3.6,
      min: 3.4,
      max: 3.8,
    };
    expect(data.points.length).toBe(2);
    expect(data.current).not.toBeNull();
  });

  it('handles null values in GasHistoryData when gas data unavailable', () => {
    const data: GasHistoryData = {
      points: [],
      current: null,
      avg: null,
      min: null,
      max: null,
    };
    expect(data.points).toEqual([]);
    expect(data.current).toBeNull();
    expect(data.avg).toBeNull();
  });
});
