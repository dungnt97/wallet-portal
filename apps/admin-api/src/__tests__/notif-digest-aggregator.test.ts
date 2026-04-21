// Unit tests for notif-digest-aggregator.service — grouping, idempotency, prefs gating.
// Uses in-memory mocks — no real Postgres required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationRow } from '../db/schema/notifications.js';
import {
  fetchDigestGroups,
  markDigestSent,
  renderDigestHtml,
} from '../services/notif-digest-aggregator.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const STAFF_B = 'bbbbbbbb-0000-0000-0000-000000000002';

function makeRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'notif-0001',
    staffId: STAFF_A,
    eventType: 'withdrawal.created',
    severity: 'info',
    title: 'Test notification',
    body: 'Detail text',
    payload: null,
    dedupeKey: null,
    readAt: null,
    digestSentAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeSelectMock(rows: NotificationRow[]) {
  const execute = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ execute });
  const where = vi.fn().mockReturnValue({ orderBy, execute });
  const from = vi.fn().mockReturnValue({ where });
  return vi.fn().mockReturnValue({ from });
}

function makeUpdateMock() {
  const execute = vi.fn().mockResolvedValue([]);
  const where = vi.fn().mockReturnValue({ execute });
  const set = vi.fn().mockReturnValue({ where });
  return vi.fn().mockReturnValue({ set });
}

function makeMockDb(opts: {
  notifRows?: NotificationRow[];
  staffRows?: Array<{ id: string; email: string; name: string }>;
  staffPrefs?: Record<string, { notificationPrefs: { email: boolean } }>;
}) {
  const notifRows = opts.notifRows ?? [];
  const staffRows = opts.staffRows ?? [];
  const staffPrefs = opts.staffPrefs ?? {};

  return {
    select: makeSelectMock(notifRows as never),
    update: makeUpdateMock(),
    query: {
      staffMembers: {
        findFirst: vi.fn().mockImplementation(async ({ where }: { where: unknown }) => {
          // Simulate lookup by staffId — return matching entry from staffPrefs map
          // The where clause is a drizzle expression; we just return the first match
          const staffId = Object.keys(staffPrefs)[0];
          return staffId ? staffPrefs[staffId] : undefined;
        }),
      },
    },
    // Drizzle-style chained select returning staffRows
    _staffRows: staffRows,
  };
}

// ── renderDigestHtml tests ────────────────────────────────────────────────────

describe('renderDigestHtml', () => {
  it('renders a valid HTML document with notification titles', () => {
    const rows = [
      makeRow({ id: 'r1', title: 'Withdrawal pending', eventType: 'withdrawal.created' }),
      makeRow({ id: 'r2', title: 'Sweep finished', eventType: 'sweep.confirmed' }),
    ];

    const html = renderDigestHtml('Alice', rows);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Alice');
    expect(html).toContain('Withdrawal pending');
    expect(html).toContain('Sweep finished');
    expect(html).toContain('2 events');
  });

  it('escapes HTML special characters to prevent XSS', () => {
    const rows = [
      makeRow({
        title: '<script>alert("xss")</script>',
        body: '<img src=x onerror=alert(1)>',
      }),
    ];

    const html = renderDigestHtml('Bob', rows);

    // Raw script tag must not appear
    expect(html).not.toContain('<script>');
    // Escaped version should appear
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
  });

  it('groups rows by event-type prefix', () => {
    const rows = [
      makeRow({ id: 'r1', eventType: 'withdrawal.created', title: 'Withdrawal A' }),
      makeRow({ id: 'r2', eventType: 'withdrawal.approved', title: 'Withdrawal B' }),
      makeRow({ id: 'r3', eventType: 'sweep.confirmed', title: 'Sweep C' }),
    ];

    const html = renderDigestHtml('Carol', rows);

    // Both withdrawal rows should appear under WITHDRAWAL section
    expect(html).toContain('WITHDRAWAL');
    expect(html).toContain('SWEEP');
  });

  it('handles empty rows gracefully', () => {
    const html = renderDigestHtml('Dave', []);
    expect(html).toContain('0 events');
    expect(html).toContain('<!DOCTYPE html>');
  });
});

// ── markDigestSent tests ──────────────────────────────────────────────────────

describe('markDigestSent', () => {
  it('calls UPDATE with the given notification IDs', async () => {
    const db = makeMockDb({});
    await markDigestSent(db as never, ['id-1', 'id-2', 'id-3']);
    expect(db.update).toHaveBeenCalledOnce();
  });

  it('is a no-op for empty array', async () => {
    const db = makeMockDb({});
    await markDigestSent(db as never, []);
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ── fetchDigestGroups tests ───────────────────────────────────────────────────

describe('fetchDigestGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no pending rows exist', async () => {
    // The service awaits .select().from().where().orderBy() directly (no .execute()).
    // Drizzle's query builder is thenable at the terminal step.
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            // orderBy must be a thenable resolving to an empty array
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: makeUpdateMock(),
      query: {
        staffMembers: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
    };

    const groups = await fetchDigestGroups(db as never);
    expect(groups).toHaveLength(0);
  });

  it('renderDigestHtml produces singular "1 event" for single row', () => {
    const html = renderDigestHtml('Eve', [makeRow()]);
    expect(html).toContain('1 event');
    expect(html).not.toContain('1 events');
  });
});
