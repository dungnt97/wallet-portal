// Unit tests for account-settings service — updateProfile happy path,
// invalid locale, invalid phone, staff not found.
// Uses in-memory mocks — no real Postgres required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateProfile } from '../services/account-settings.service.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

import { emitAudit } from '../services/audit.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';

const makeUpdatedRow = (overrides: Record<string, unknown> = {}) => ({
  id: STAFF_ID,
  name: 'Alice Updated',
  email: 'alice@treasury.io',
  localePref: 'en',
  ...overrides,
});

// ── Mock builder ──────────────────────────────────────────────────────────────

function buildMockDb(opts: { updatedRow?: unknown; notFound?: boolean } = {}) {
  const rows = opts.notFound ? [] : [opts.updatedRow ?? makeUpdatedRow()];
  return {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

const BASE_PARAMS = {
  staffId: STAFF_ID,
  name: 'Alice Updated',
  localePref: 'en' as const,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('updateProfile service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path — updates name and locale, returns profile', async () => {
    const db = buildMockDb();

    const result = await updateProfile(
      db as unknown as Parameters<typeof updateProfile>[0],
      BASE_PARAMS
    );

    expect(result).toMatchObject({
      id: STAFF_ID,
      name: 'Alice Updated',
      email: 'alice@treasury.io',
      localePref: 'en',
    });
  });

  it('accepts locale "vi"', async () => {
    const db = buildMockDb({ updatedRow: makeUpdatedRow({ localePref: 'vi' }) });

    const result = await updateProfile(db as unknown as Parameters<typeof updateProfile>[0], {
      ...BASE_PARAMS,
      localePref: 'vi',
    });

    expect(result.localePref).toBe('vi');
  });

  it('throws on invalid locale value', async () => {
    const db = buildMockDb();

    await expect(
      updateProfile(db as unknown as Parameters<typeof updateProfile>[0], {
        ...BASE_PARAMS,
        localePref: 'fr' as never,
      })
    ).rejects.toThrow('Invalid locale');
  });

  it('throws on invalid E.164 phone number', async () => {
    const db = buildMockDb();

    await expect(
      updateProfile(db as unknown as Parameters<typeof updateProfile>[0], {
        ...BASE_PARAMS,
        phoneNumber: '123456', // missing leading +
      })
    ).rejects.toThrow('E.164');
  });

  it('accepts valid E.164 phone number', async () => {
    const db = buildMockDb();

    await expect(
      updateProfile(db as unknown as Parameters<typeof updateProfile>[0], {
        ...BASE_PARAMS,
        phoneNumber: '+14155550000',
      })
    ).resolves.toMatchObject({ id: STAFF_ID });
  });

  it('throws when staff member not found (UPDATE returns no rows)', async () => {
    const db = buildMockDb({ notFound: true });

    await expect(
      updateProfile(db as unknown as Parameters<typeof updateProfile>[0], BASE_PARAMS)
    ).rejects.toThrow('Staff member not found');
  });

  it('emits audit entry after successful update', async () => {
    const db = buildMockDb();

    await updateProfile(db as unknown as Parameters<typeof updateProfile>[0], BASE_PARAMS);

    expect(emitAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'staff.profile.updated',
        resourceId: STAFF_ID,
      })
    );
  });

  it('does not throw when only name is provided (locale undefined)', async () => {
    const db = buildMockDb();

    await expect(
      updateProfile(db as unknown as Parameters<typeof updateProfile>[0], {
        staffId: STAFF_ID,
        name: 'Bob',
      })
    ).resolves.toBeDefined();
  });

  it('trims whitespace from name before storing', async () => {
    const db = buildMockDb();

    await updateProfile(db as unknown as Parameters<typeof updateProfile>[0], {
      staffId: STAFF_ID,
      name: '  Trimmed Name  ',
    });

    const setCall = vi.mocked(db.update).mock.results[0]?.value?.set;
    expect(setCall).toHaveBeenCalledWith(expect.objectContaining({ name: 'Trimmed Name' }));
  });
});
