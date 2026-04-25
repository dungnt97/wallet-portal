// Unit tests for isKillSwitchEnabled.
// Covers enabled=true, enabled=false, missing row (default false), and DB error (fail-closed).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isKillSwitchEnabled } from '../services/kill-switch-db-query.js';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeDb(rows: { enabled: boolean }[] | Error) {
  const mock = {
    execute: vi
      .fn()
      .mockImplementation(() =>
        rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows)
      ),
  };
  return mock as unknown as import('../db/client.js').Db & typeof mock;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('isKillSwitchEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when enabled=true in DB', async () => {
    const db = makeDb([{ enabled: true }]);
    const result = await isKillSwitchEnabled(db);
    expect(result).toBe(true);
  });

  it('returns false when enabled=false in DB', async () => {
    const db = makeDb([{ enabled: false }]);
    const result = await isKillSwitchEnabled(db);
    expect(result).toBe(false);
  });

  it('returns false when no rows exist (migration not yet applied)', async () => {
    const db = makeDb([]);
    const result = await isKillSwitchEnabled(db);
    expect(result).toBe(false);
  });

  it('returns false when rows is null/undefined (defensive)', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(null),
    } as never;
    const result = await isKillSwitchEnabled(db);
    expect(result).toBe(false);
  });

  it('propagates DB error (fail-open is acceptable — caller handles)', async () => {
    const db = makeDb(new Error('connection refused'));
    await expect(isKillSwitchEnabled(db)).rejects.toThrow('connection refused');
  });

  it('queries system_kill_switch with id=1', async () => {
    const db = makeDb([{ enabled: false }]);
    await isKillSwitchEnabled(db);

    const query = String(vi.mocked(db.execute).mock.calls[0]?.[0]);
    expect(query).toContain('system_kill_switch');
    expect(query).toContain('id = 1');
  });
});
