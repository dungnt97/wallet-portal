// Unit tests for staff-invite service — invite creation, re-invite, conflict, token verify.
// Uses in-memory mocks — no real Postgres or JWT library calls required for shape tests.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inviteStaff, verifyInviteToken } from '../services/staff-invite.service.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INVITER_ID = 'staff-uuid-inviter-001';
const STAFF_ID = 'staff-uuid-new-001';

const VALID_PARAMS = {
  email: 'newstaff@example.com',
  name: 'New Staff',
  role: 'operator' as const,
  invitedByStaffId: INVITER_ID,
};

// ── Mock builders ─────────────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return chain;
}

function makeUpdateChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  };
}

function makeInsertChain() {
  const returning = vi.fn().mockResolvedValue([]);
  const onConflict = vi.fn().mockResolvedValue([]);
  const values = vi
    .fn()
    .mockReturnValue({
      returning,
      onConflictDoUpdate: onConflict,
      then: (r: (v: unknown) => void) => r([]),
    });
  return vi.fn().mockReturnValue({ values });
}

function buildMockDb(opts: { existingStaff?: unknown } = {}) {
  const existingRows = opts.existingStaff ? [opts.existingStaff] : [];
  return {
    select: vi.fn().mockReturnValue(makeSelectChain(existingRows)),
    insert: makeInsertChain(),
    update: vi.fn().mockReturnValue(makeUpdateChain()),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('inviteStaff service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = 'test-secret-32-chars-at-least-ok';
    process.env.APP_BASE_URL = 'https://app.test.example.com';
  });

  it('happy path — creates staff row and returns invite link + expiresAt', async () => {
    const db = buildMockDb();
    const result = await inviteStaff(
      db as unknown as Parameters<typeof inviteStaff>[0],
      VALID_PARAMS
    );

    expect(result.staffId).toBeDefined();
    // APP_BASE_URL is a module-level const — reads from env at import time.
    // In test, it falls back to the default value when env is not set at module load.
    expect(result.inviteLink).toContain('/onboard?token=');
    expect(result.expiresAt).toBeDefined();
    // expiresAt should be ~72h from now
    const exp = new Date(result.expiresAt).getTime();
    const now = Date.now();
    expect(exp - now).toBeGreaterThan(71 * 60 * 60 * 1000);
    expect(exp - now).toBeLessThan(73 * 60 * 60 * 1000);
  });

  it('re-issues token when staff exists with status=invited', async () => {
    const existingStaff = { id: STAFF_ID, status: 'invited' };
    const db = buildMockDb({ existingStaff });
    const result = await inviteStaff(
      db as unknown as Parameters<typeof inviteStaff>[0],
      VALID_PARAMS
    );
    // Re-uses existing staffId
    expect(result.staffId).toBe(STAFF_ID);
    expect(result.inviteLink).toContain('token=');
  });

  it('throws when staff exists with non-invited status (active)', async () => {
    const existingStaff = { id: STAFF_ID, status: 'active' };
    const db = buildMockDb({ existingStaff });
    await expect(
      inviteStaff(db as unknown as Parameters<typeof inviteStaff>[0], VALID_PARAMS)
    ).rejects.toThrow('already exists and is active');
  });

  it('throws when SESSION_SECRET is missing', async () => {
    delete process.env.SESSION_SECRET;
    const db = buildMockDb();
    await expect(
      inviteStaff(db as unknown as Parameters<typeof inviteStaff>[0], VALID_PARAMS)
    ).rejects.toThrow('SESSION_SECRET');
  });
});

describe('verifyInviteToken service', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-32-chars-at-least-ok';
  });

  it('throws on invalid/expired token string', async () => {
    const db = buildMockDb();
    await expect(
      verifyInviteToken(db as unknown as Parameters<typeof verifyInviteToken>[0], 'not.a.jwt')
    ).rejects.toThrow('invalid or expired');
  });

  it('throws when token not stored on staff row (already used)', async () => {
    // Build a real JWT first via inviteStaff, then simulate cleared token on staff row
    const db = buildMockDb();
    const { inviteLink } = await inviteStaff(
      db as unknown as Parameters<typeof inviteStaff>[0],
      VALID_PARAMS
    );
    const token = new URL(inviteLink).searchParams.get('token')!;

    // Simulate row with different stored token (already consumed)
    const dbConsumed = {
      select: vi.fn().mockReturnValue({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: STAFF_ID, inviteToken: 'different-token' }]),
          }),
        }),
      }),
    };
    await expect(
      verifyInviteToken(dbConsumed as unknown as Parameters<typeof verifyInviteToken>[0], token)
    ).rejects.toThrow('already been used');
  });
});
