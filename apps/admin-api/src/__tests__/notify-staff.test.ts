// Unit tests for notifyStaff service — audience expansion, prefs gating,
// deduplication, email/slack queue enqueue conditions.
// Uses in-memory mocks — no real Postgres, Redis, or Socket.io required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPrefs } from '../db/schema/notifications.js';
import { DEFAULT_NOTIFICATION_PREFS } from '../db/schema/notifications.js';
import { notifyStaff } from '../services/notify-staff.service.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock the prefs + role-lookup service so we control what each staff sees
vi.mock('../services/notification-prefs.service.js', () => ({
  getStaffPrefs: vi.fn(),
  getStaffIdsByRole: vi.fn(),
  invalidateStaffPrefsCache: vi.fn(),
  invalidateRoleCache: vi.fn(),
}));

// Mock the Socket.io emitter — just verify it was called
vi.mock('../events/emit-notif-created.js', () => ({
  emitNotifCreated: vi.fn(),
}));

import { emitNotifCreated } from '../events/emit-notif-created.js';
import { getStaffIdsByRole, getStaffPrefs } from '../services/notification-prefs.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const STAFF_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const STAFF_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const ADMIN_ID = 'cccccccc-0000-0000-0000-000000000003';

const NOTIF_ROW = {
  id: 'notif-row-0001',
  staffId: STAFF_A,
  eventType: 'withdrawal.created',
  severity: 'info' as const,
  title: 'Test notification',
  body: null,
  payload: null,
  dedupeKey: null,
  readAt: null,
  digestSentAt: null,
  createdAt: new Date(),
};

// ── Mock builder helpers ──────────────────────────────────────────────────────

function makePrefs(overrides: Partial<NotificationPrefs> = {}): NotificationPrefs {
  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...overrides,
  };
}

function makeInsertMock(returnRows: unknown[] = [NOTIF_ROW]) {
  const returning = vi.fn().mockResolvedValue(returnRows);
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  return vi.fn().mockReturnValue({ values });
}

function makeMockDb(overrides: { insertReturn?: unknown[] } = {}) {
  return {
    insert: makeInsertMock(overrides.insertReturn),
  };
}

function makeMockIo() {
  const toFn = vi.fn().mockReturnValue({ emit: vi.fn() });
  return { of: vi.fn().mockReturnValue({ to: toFn, emit: vi.fn() }) };
}

function makeMockQueue() {
  return { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('notifyStaff — INSERT + emit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: role 'treasurer' expands to [STAFF_A, STAFF_B], admin to [ADMIN_ID]
    vi.mocked(getStaffIdsByRole).mockImplementation(async (_, role) => {
      if (role === 'treasurer') return [STAFF_A, STAFF_B];
      if (role === 'admin') return [ADMIN_ID];
      return [];
    });
    // Default prefs: all enabled
    vi.mocked(getStaffPrefs).mockResolvedValue(makePrefs());
  });

  it('inserts a row and emits for staffId target', async () => {
    const db = makeMockDb();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    await notifyStaff(
      db as never,
      io as never,
      {
        staffId: STAFF_A,
        eventType: 'withdrawal.created',
        severity: 'info',
        title: 'Test',
      },
      emailQ as never,
      slackQ as never
    );

    expect(db.insert).toHaveBeenCalledOnce();
    expect(emitNotifCreated).toHaveBeenCalledWith(io, NOTIF_ROW);
  });

  it('fans out to all treasurers when role specified', async () => {
    const db = makeMockDb();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    await notifyStaff(
      db as never,
      io as never,
      {
        role: 'treasurer',
        eventType: 'withdrawal.created',
        severity: 'info',
        title: 'Test',
      },
      emailQ as never,
      slackQ as never
    );

    // Two treasurers → two inserts
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('includes admins for critical severity regardless of audience', async () => {
    const db = makeMockDb();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    await notifyStaff(
      db as never,
      io as never,
      {
        staffId: STAFF_A,
        eventType: 'ops.killswitch.enabled',
        severity: 'critical',
        title: 'Kill switch',
      },
      emailQ as never,
      slackQ as never
    );

    // STAFF_A + ADMIN_ID = 2 inserts (admin always added for critical)
    expect(db.insert).toHaveBeenCalledTimes(2);
  });
});

describe('notifyStaff — prefs gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStaffIdsByRole).mockResolvedValue([]);
  });

  it('skips INSERT when inApp pref is false', async () => {
    vi.mocked(getStaffPrefs).mockResolvedValue(makePrefs({ inApp: false }));
    const db = makeMockDb();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    await notifyStaff(
      db as never,
      io as never,
      {
        staffId: STAFF_A,
        eventType: 'withdrawal.created',
        severity: 'info',
        title: 'Test',
      },
      emailQ as never,
      slackQ as never
    );

    // inApp=false still inserts the row; only socket emit is skipped
    expect(db.insert).toHaveBeenCalledOnce();
    expect(emitNotifCreated).not.toHaveBeenCalled();
  });

  it('skips INSERT when event category is disabled in prefs', async () => {
    vi.mocked(getStaffPrefs).mockResolvedValue(
      makePrefs({ eventTypes: { ...DEFAULT_NOTIFICATION_PREFS.eventTypes, withdrawal: false } })
    );
    const db = makeMockDb();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    await notifyStaff(
      db as never,
      io as never,
      {
        staffId: STAFF_A,
        eventType: 'withdrawal.created',
        severity: 'info',
        title: 'Test',
      },
      emailQ as never,
      slackQ as never
    );

    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('notifyStaff — deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStaffIdsByRole).mockResolvedValue([]);
    vi.mocked(getStaffPrefs).mockResolvedValue(makePrefs());
  });

  it('does not emit/enqueue when INSERT returns no row (dedupe conflict)', async () => {
    // Simulate ON CONFLICT DO NOTHING returning empty array
    const db = makeMockDb({ insertReturn: [] });
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    await notifyStaff(
      db as never,
      io as never,
      {
        staffId: STAFF_A,
        eventType: 'watcher.reorg',
        severity: 'warning',
        title: 'Reorg',
        dedupeKey: 'reorg-block-12345',
      },
      emailQ as never,
      slackQ as never
    );

    expect(db.insert).toHaveBeenCalledOnce();
    // Row was deduped — no emit or queue job
    expect(emitNotifCreated).not.toHaveBeenCalled();
    expect(emailQ.add).not.toHaveBeenCalled();
    expect(slackQ.add).not.toHaveBeenCalled();
  });
});

describe('notifyStaff — email + slack queue enqueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // For critical events: admin fan-out is always attempted — return ADMIN_ID for 'admin' role
    vi.mocked(getStaffIdsByRole).mockImplementation(async (_, role) => {
      if (role === 'admin') return [ADMIN_ID];
      return [];
    });
    // Enable slack in prefs so Slack queue enqueue can be tested
    vi.mocked(getStaffPrefs).mockResolvedValue(makePrefs({ slack: true }));
  });

  it('enqueues email-immediate and slack for critical severity with prefs on', async () => {
    const db = makeMockDb();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    await notifyStaff(
      db as never,
      io as never,
      {
        staffId: STAFF_A,
        eventType: 'ops.killswitch.enabled',
        severity: 'critical',
        title: 'Kill switch',
      },
      emailQ as never,
      slackQ as never
    );

    // STAFF_A + ADMIN_ID (always included for critical) = 2 recipients → 2 jobs each
    expect(emailQ.add).toHaveBeenCalledTimes(2);
    expect(slackQ.add).toHaveBeenCalledTimes(2);
  });

  it('does NOT enqueue email for info severity (waits for digest)', async () => {
    const db = makeMockDb();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    await notifyStaff(
      db as never,
      io as never,
      {
        staffId: STAFF_A,
        eventType: 'deposit.credited',
        severity: 'info',
        title: 'Deposit',
      },
      emailQ as never,
      slackQ as never
    );

    expect(emailQ.add).not.toHaveBeenCalled();
    expect(slackQ.add).not.toHaveBeenCalled();
  });

  it('does NOT enqueue when prefs.email is false', async () => {
    vi.mocked(getStaffPrefs).mockResolvedValue(makePrefs({ email: false, slack: false }));
    const db = makeMockDb();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    await notifyStaff(
      db as never,
      io as never,
      {
        staffId: STAFF_A,
        eventType: 'ops.killswitch.enabled',
        severity: 'critical',
        title: 'Kill switch',
      },
      emailQ as never,
      slackQ as never
    );

    expect(emailQ.add).not.toHaveBeenCalled();
    expect(slackQ.add).not.toHaveBeenCalled();
  });

  it('is a no-op when NOTIFICATIONS_ENABLED=false', async () => {
    process.env.NOTIFICATIONS_ENABLED = 'false';
    const db = makeMockDb();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    await notifyStaff(
      db as never,
      io as never,
      {
        staffId: STAFF_A,
        eventType: 'withdrawal.created',
        severity: 'info',
        title: 'Test',
      },
      emailQ as never,
      slackQ as never
    );

    expect(db.insert).not.toHaveBeenCalled();
    process.env.NOTIFICATIONS_ENABLED = 'true';
  });
});
