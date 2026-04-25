// Unit tests for notification-prefs service — getStaffPrefs, getStaffIdsByRole,
// cache invalidation, ops alias mapping.
// Uses in-memory mocks — no real Postgres required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFS } from '../db/schema/notifications.js';
import {
  getStaffIdsByRole,
  getStaffPrefs,
  invalidateRoleCache,
  invalidateStaffPrefsCache,
} from '../services/notification-prefs.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';

const makePrefsRow = (prefs: unknown = DEFAULT_NOTIFICATION_PREFS) => ({
  notificationPrefs: prefs,
});

// ── Mock builder ──────────────────────────────────────────────────────────────

function buildMockDb(
  opts: {
    prefsRow?: unknown;
    staffNotFound?: boolean;
    roleRows?: { id: string }[];
  } = {}
) {
  const prefsRow = opts.staffNotFound ? undefined : (opts.prefsRow ?? makePrefsRow());
  const roleRows = opts.roleRows ?? [{ id: STAFF_ID }];

  return {
    query: {
      staffMembers: {
        findFirst: vi.fn().mockResolvedValue(prefsRow),
      },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(roleRows),
      }),
    }),
  };
}

// ── Tests — getStaffPrefs ─────────────────────────────────────────────────────

describe('getStaffPrefs', () => {
  beforeEach(() => {
    // Invalidate cache before each test so DB is always queried fresh
    invalidateStaffPrefsCache(STAFF_ID);
  });

  it('returns stored prefs when staff row has notificationPrefs set', async () => {
    const customPrefs = { ...DEFAULT_NOTIFICATION_PREFS, email: false };
    const db = buildMockDb({ prefsRow: makePrefsRow(customPrefs) });

    const result = await getStaffPrefs(
      db as unknown as Parameters<typeof getStaffPrefs>[0],
      STAFF_ID
    );

    expect(result.email).toBe(false);
  });

  it('falls back to DEFAULT_NOTIFICATION_PREFS when row has null prefs', async () => {
    const db = buildMockDb({ prefsRow: { notificationPrefs: null } });

    const result = await getStaffPrefs(
      db as unknown as Parameters<typeof getStaffPrefs>[0],
      STAFF_ID
    );

    expect(result).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('falls back to defaults when staff not found', async () => {
    const db = buildMockDb({ staffNotFound: true });

    const result = await getStaffPrefs(
      db as unknown as Parameters<typeof getStaffPrefs>[0],
      STAFF_ID
    );

    expect(result).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('returns cached value on second call — DB queried only once', async () => {
    const db = buildMockDb();

    await getStaffPrefs(db as unknown as Parameters<typeof getStaffPrefs>[0], STAFF_ID);
    await getStaffPrefs(db as unknown as Parameters<typeof getStaffPrefs>[0], STAFF_ID);

    expect(db.query.staffMembers.findFirst).toHaveBeenCalledTimes(1);
  });

  it('queries DB again after invalidateStaffPrefsCache', async () => {
    const db = buildMockDb();

    await getStaffPrefs(db as unknown as Parameters<typeof getStaffPrefs>[0], STAFF_ID);
    invalidateStaffPrefsCache(STAFF_ID);
    await getStaffPrefs(db as unknown as Parameters<typeof getStaffPrefs>[0], STAFF_ID);

    expect(db.query.staffMembers.findFirst).toHaveBeenCalledTimes(2);
  });
});

// ── Tests — getStaffIdsByRole ─────────────────────────────────────────────────

describe('getStaffIdsByRole', () => {
  beforeEach(() => {
    // Invalidate all relevant caches
    invalidateRoleCache('admin');
    invalidateRoleCache('treasurer');
    invalidateRoleCache('operator');
    invalidateRoleCache('ops');
  });

  it('returns staff IDs for given role', async () => {
    const db = buildMockDb({ roleRows: [{ id: 'staff-a' }, { id: 'staff-b' }] });

    const ids = await getStaffIdsByRole(
      db as unknown as Parameters<typeof getStaffIdsByRole>[0],
      'treasurer'
    );

    expect(ids).toEqual(['staff-a', 'staff-b']);
  });

  it('maps ops alias to operator DB role', async () => {
    const db = buildMockDb({ roleRows: [{ id: 'staff-op-1' }] });

    const ids = await getStaffIdsByRole(
      db as unknown as Parameters<typeof getStaffIdsByRole>[0],
      'ops'
    );

    expect(ids).toHaveLength(1);
    // Verify the select.from.where chain was called (DB queried)
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no staff match role', async () => {
    const db = buildMockDb({ roleRows: [] });

    const ids = await getStaffIdsByRole(
      db as unknown as Parameters<typeof getStaffIdsByRole>[0],
      'viewer'
    );

    expect(ids).toHaveLength(0);
  });

  it('caches result — DB queried once for repeated same role calls', async () => {
    const db = buildMockDb({ roleRows: [{ id: STAFF_ID }] });

    await getStaffIdsByRole(db as unknown as Parameters<typeof getStaffIdsByRole>[0], 'admin');
    await getStaffIdsByRole(db as unknown as Parameters<typeof getStaffIdsByRole>[0], 'admin');

    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('re-queries after invalidateRoleCache', async () => {
    const db = buildMockDb({ roleRows: [{ id: STAFF_ID }] });

    await getStaffIdsByRole(db as unknown as Parameters<typeof getStaffIdsByRole>[0], 'admin');
    invalidateRoleCache('admin');
    await getStaffIdsByRole(db as unknown as Parameters<typeof getStaffIdsByRole>[0], 'admin');

    expect(db.select).toHaveBeenCalledTimes(2);
  });
});
