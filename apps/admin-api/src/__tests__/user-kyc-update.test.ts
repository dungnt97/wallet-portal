// Unit tests for user-kyc-update service
// Uses in-memory DB mocks — no real Postgres required.
import { describe, expect, it, vi } from 'vitest';
import {
  NotFoundError,
  ValidationError,
  updateUserKyc,
} from '../services/user-kyc-update.service.js';

// ── Mock helpers ──────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const STAFF_ID = 'staff-uuid-0001';

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'test@example.com',
    kycTier: 'none',
    riskScore: 0,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMockDb(opts: {
  existingUser?: ReturnType<typeof makeUserRow> | undefined;
  updatedUser?: ReturnType<typeof makeUserRow>;
}) {
  const updatedRow = opts.updatedUser ?? makeUserRow({ kycTier: 'basic' });
  return {
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue(opts.existingUser),
      },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedRow]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('updateUserKyc', () => {
  it('updates kyc_tier and returns updated user', async () => {
    const existing = makeUserRow({ kycTier: 'none' });
    const updated = makeUserRow({ kycTier: 'basic' });
    const db = makeMockDb({ existingUser: existing, updatedUser: updated });

    const result = await updateUserKyc(db as unknown as Parameters<typeof updateUserKyc>[0], {
      userId: USER_ID,
      kycTier: 'basic',
      staffId: STAFF_ID,
    });

    expect(result.user.kycTier).toBe('basic');
    expect(db.update).toHaveBeenCalledOnce();
  });

  it('inserts audit entry with before/after diff (no PII in changes)', async () => {
    const existing = makeUserRow({ kycTier: 'none' });
    const updated = makeUserRow({ kycTier: 'enhanced' });
    const db = makeMockDb({ existingUser: existing, updatedUser: updated });

    await updateUserKyc(db as unknown as Parameters<typeof updateUserKyc>[0], {
      userId: USER_ID,
      kycTier: 'enhanced',
      staffId: STAFF_ID,
    });

    // Audit insert called once with correct changes
    expect(db.insert).toHaveBeenCalledOnce();
    const insertCall = db.insert.mock.calls[0];
    // insert receives the auditLog table — verify values() was called
    const values = (db.insert.mock.results[0]?.value as { values: typeof vi.fn }).values;
    expect(values).toHaveBeenCalledOnce();
    const auditPayload = (values as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      changes: { before: { kycTier: string }; after: { kycTier: string } };
    };
    expect(auditPayload.changes.before.kycTier).toBe('none');
    expect(auditPayload.changes.after.kycTier).toBe('enhanced');
    // No raw email in changes
    expect(JSON.stringify(auditPayload.changes)).not.toContain('@');
    expect(insertCall).toBeDefined();
  });

  it('throws NotFoundError when user does not exist', async () => {
    const db = makeMockDb({ existingUser: undefined });

    await expect(
      updateUserKyc(db as unknown as Parameters<typeof updateUserKyc>[0], {
        userId: USER_ID,
        kycTier: 'basic',
        staffId: STAFF_ID,
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when tier is unchanged', async () => {
    const existing = makeUserRow({ kycTier: 'basic' });
    const db = makeMockDb({ existingUser: existing });

    await expect(
      updateUserKyc(db as unknown as Parameters<typeof updateUserKyc>[0], {
        userId: USER_ID,
        kycTier: 'basic', // same as existing
        staffId: STAFF_ID,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('does not call update when user is not found', async () => {
    const db = makeMockDb({ existingUser: undefined });

    try {
      await updateUserKyc(db as unknown as Parameters<typeof updateUserKyc>[0], {
        userId: USER_ID,
        kycTier: 'enhanced',
        staffId: STAFF_ID,
      });
    } catch {
      // expected
    }

    expect(db.update).not.toHaveBeenCalled();
  });
});
