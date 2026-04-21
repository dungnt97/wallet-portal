// Unit tests for BlockCheckpoint — mocked DB, no real network
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client.js';
import { BlockCheckpoint } from '../watcher/block-checkpoint.js';

/** Build a mock DB whose insert().values().onConflictDoUpdate() chain resolves void */
function makeDb(
  opts: {
    loadRow?: { lastBlock: number } | null;
    loadHashRow?: { lastHash: string | null } | null;
    insertFails?: boolean;
    updateCount?: number;
  } = {}
): Db {
  const selectChain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi
          .fn()
          .mockResolvedValue(
            opts.loadRow !== undefined
              ? opts.loadRow !== null
                ? [opts.loadRow]
                : []
              : opts.loadHashRow !== undefined
                ? opts.loadHashRow !== null
                  ? [opts.loadHashRow]
                  : []
                : []
          ),
      }),
    }),
  };

  const onConflictDoUpdate = opts.insertFails
    ? vi.fn().mockRejectedValue(new Error('DB write failed'))
    : vi.fn().mockResolvedValue([]);

  const insertChain = {
    values: vi.fn().mockReturnValue({ onConflictDoUpdate }),
  };

  const updateChain = {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(opts.updateCount ?? 1),
    }),
  };

  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
  } as unknown as Db;
}

describe('BlockCheckpoint.load', () => {
  it('returns lastBlock from DB row', async () => {
    const db = makeDb({ loadRow: { lastBlock: 42 } });
    const cp = new BlockCheckpoint(db);
    expect(await cp.load('bnb')).toBe(42);
  });

  it('returns null when no row exists', async () => {
    const db = makeDb({ loadRow: null });
    const cp = new BlockCheckpoint(db);
    expect(await cp.load('bnb')).toBeNull();
  });

  it('returns null and does not throw on DB error', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('DB down')),
          }),
        }),
      }),
    } as unknown as Db;
    const cp = new BlockCheckpoint(db);
    expect(await cp.load('sol')).toBeNull();
  });
});

describe('BlockCheckpoint.save', () => {
  it('upserts the row without throwing', async () => {
    const db = makeDb();
    const cp = new BlockCheckpoint(db);
    await expect(cp.save('bnb', 100, '0xhash')).resolves.not.toThrow();
    expect(db.insert).toHaveBeenCalled();
  });

  it('silently handles DB write failure', async () => {
    const db = makeDb({ insertFails: true });
    const cp = new BlockCheckpoint(db);
    await expect(cp.save('bnb', 100)).resolves.not.toThrow();
  });
});

describe('BlockCheckpoint.detectReorg', () => {
  let cp: BlockCheckpoint;

  beforeEach(() => {
    cp = new BlockCheckpoint({} as unknown as Db);
  });

  it('returns null when storedHash is null (first run)', () => {
    expect(cp.detectReorg(null, '0xnew', 50)).toBeNull();
  });

  it('returns null when hashes match (no reorg)', () => {
    expect(cp.detectReorg('0xsame', '0xsame', 50)).toBeNull();
  });

  it('returns rollback target when hashes diverge', () => {
    const rollback = cp.detectReorg('0xold', '0xnew', 50);
    expect(rollback).not.toBeNull();
    expect(rollback).toBe(47); // 50 - 3
  });

  it('clamps rollback target to minimum 0', () => {
    const rollback = cp.detectReorg('0xold', '0xdifferent', 1);
    expect(rollback).toBe(0);
  });
});

describe('BlockCheckpoint.markReorgPending', () => {
  it('updates deposit status for provided tx hashes', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(2),
      }),
    });
    const db = { update: mockUpdate } as unknown as Db;
    const cp = new BlockCheckpoint(db);
    await expect(cp.markReorgPending(['0xtx1', '0xtx2'])).resolves.not.toThrow();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('skips DB call for empty array', async () => {
    const db = { update: vi.fn() } as unknown as Db;
    const cp = new BlockCheckpoint(db);
    await cp.markReorgPending([]);
    expect(db.update).not.toHaveBeenCalled();
  });
});
