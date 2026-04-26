import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for notifications.routes.ts
// Tests: GET /notifications, GET /notifications/unread-count,
//        POST /notifications/:id/read, POST /notifications/mark-all-read,
//        GET /staff/me/notification-prefs, PATCH /staff/me/notification-prefs
// Uses Fastify inject + mocked DB — no real Postgres
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/notification-prefs.service.js', () => ({
  invalidateStaffPrefsCache: vi.fn(),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const NOTIF_ID = '00000000-0000-0000-0000-000000000002';

const DEFAULT_PREFS = {
  inApp: true,
  email: true,
  slack: false,
  sms: false,
  eventTypes: {
    withdrawal: true,
    sweep: true,
    deposit: true,
    killSwitch: true,
    reorg: true,
    health: true,
    coldTimelock: true,
    reconciliation: true,
  },
};

function makeNotifRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIF_ID,
    staffId: STAFF_ID,
    eventType: 'withdrawal.created',
    severity: 'info' as const,
    title: 'Withdrawal created',
    body: null,
    payload: null,
    dedupeKey: null,
    readAt: null,
    digestSentAt: null,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

async function buildApp(
  opts: {
    notifRows?: Record<string, unknown>[];
    unreadCount?: number;
    updateReturning?: Array<{ id: string }>;
    staffPrefs?: Record<string, unknown> | null;
    updatePrefsOk?: boolean;
    role?: string;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const notifRows = opts.notifRows ?? [makeNotifRow()];
  const unreadCount = opts.unreadCount ?? 1;
  const updateReturning = opts.updateReturning ?? [{ id: NOTIF_ID }];
  const staffPrefs = opts.staffPrefs === undefined ? DEFAULT_PREFS : opts.staffPrefs;

  // Track select calls to dispatch list vs count
  let selectCallN = 0;
  const mockSelect = vi.fn(() => {
    selectCallN++;
    if (selectCallN === 2) {
      // unread-count query: select({ count }).from().where()
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: unreadCount }]),
        }),
      };
    }
    // list query: select().from().where().orderBy().limit()
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(notifRows),
          }),
        }),
      }),
    };
  });

  // update().set().where().returning()
  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(updateReturning),
      }),
    }),
  });

  const mockDb = {
    select: mockSelect,
    update: mockUpdate,
    query: {
      staffMembers: {
        findFirst: vi
          .fn()
          .mockResolvedValue(staffPrefs !== null ? { notificationPrefs: staffPrefs } : null),
      },
    },
  };

  app.decorate('db', mockDb as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: opts.role ?? 'admin' },
    } as unknown as typeof req.session;
  });

  const { default: notificationsRoutes } = await import('../routes/notifications.routes.js');
  await app.register(notificationsRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /notifications ─────────────────────────────────────────────────

describe('GET /notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns list of notifications', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/notifications' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(NOTIF_ID);
    expect(body.total).toBe(1);
    await app.close();
  });

  it('returns empty list when no notifications', async () => {
    const app = await buildApp({ notifRows: [] });
    const res = await app.inject({ method: 'GET', url: '/notifications' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual([]);
    await app.close();
  });

  it('serialises dates to ISO strings', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/notifications' });
    const body = JSON.parse(res.body);
    expect(body.data[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });

  it('serialises readAt as ISO string when set', async () => {
    const app = await buildApp({
      notifRows: [makeNotifRow({ readAt: new Date('2026-01-15T11:00:00Z') })],
    });
    const res = await app.inject({ method: 'GET', url: '/notifications' });
    const body = JSON.parse(res.body);
    expect(body.data[0].readAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });

  it('accepts limit and unread query params', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/notifications?limit=10&unread=true',
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ── Tests: GET /notifications/unread-count ────────────────────────────────────

describe('GET /notifications/unread-count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unread count', async () => {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 3 }]),
      }),
    });
    app.decorate('db', {
      select: mockSelect,
      query: { staffMembers: { findFirst: vi.fn() } },
      update: vi.fn(),
    } as never);
    app.addHook('preHandler', async (req) => {
      req.session = { staff: { id: STAFF_ID, role: 'admin' } } as unknown as typeof req.session;
    });

    const { default: notificationsRoutes } = await import('../routes/notifications.routes.js');
    await app.register(notificationsRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/notifications/unread-count' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).count).toBe(3);
    await app.close();
  });
});

// ── Tests: POST /notifications/:id/read ──────────────────────────────────────

describe('POST /notifications/:id/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks notification as read and returns ok', async () => {
    const app = await buildApp({ updateReturning: [{ id: NOTIF_ID }] });
    const res = await app.inject({
      method: 'POST',
      url: `/notifications/${NOTIF_ID}/read`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    await app.close();
  });

  it('returns 404 when notification not found or already read', async () => {
    const app = await buildApp({ updateReturning: [] });
    const res = await app.inject({
      method: 'POST',
      url: `/notifications/${NOTIF_ID}/read`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 400 for non-uuid id', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/notifications/not-a-uuid/read' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: POST /notifications/mark-all-read ─────────────────────────────────

describe('POST /notifications/mark-all-read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks all notifications read and returns count', async () => {
    const app = await buildApp({
      updateReturning: [{ id: NOTIF_ID }, { id: '00000000-0000-0000-0000-000000000099' }],
    });
    const res = await app.inject({ method: 'POST', url: '/notifications/mark-all-read' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.updated).toBe(2);
    await app.close();
  });

  it('returns updated=0 when nothing to mark', async () => {
    const app = await buildApp({ updateReturning: [] });
    const res = await app.inject({ method: 'POST', url: '/notifications/mark-all-read' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).updated).toBe(0);
    await app.close();
  });
});

// ── Tests: GET /staff/me/notification-prefs ───────────────────────────────────

describe('GET /staff/me/notification-prefs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stored notification prefs', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/staff/me/notification-prefs' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.inApp).toBe(true);
    expect(body.email).toBe(true);
    expect(body.eventTypes).toBeDefined();
    await app.close();
  });

  it('returns defaults when no prefs stored', async () => {
    const app = await buildApp({ staffPrefs: null });
    const res = await app.inject({ method: 'GET', url: '/staff/me/notification-prefs' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.inApp).toBe(true);
    await app.close();
  });
});

// ── Tests: PATCH /staff/me/notification-prefs ────────────────────────────────

describe('PATCH /staff/me/notification-prefs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges and returns updated prefs', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/staff/me/notification-prefs',
      payload: { email: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe(false);
    expect(body.inApp).toBe(true); // unchanged
    await app.close();
  });

  it('returns 404 when staff member not found', async () => {
    const app = await buildApp({ staffPrefs: null });
    // Simulate findFirst returning null (staff not found)
    const mockDb = {
      select: vi.fn(),
      update: vi.fn(),
      query: { staffMembers: { findFirst: vi.fn().mockResolvedValue(null) } },
    };
    const freshApp = Fastify({ logger: false });
    freshApp.setValidatorCompiler(validatorCompiler);
    freshApp.setSerializerCompiler(serializerCompiler);
    freshApp.decorate('db', mockDb as never);
    freshApp.addHook('preHandler', async (req) => {
      req.session = { staff: { id: STAFF_ID, role: 'admin' } } as unknown as typeof req.session;
    });
    const { default: notificationsRoutes } = await import('../routes/notifications.routes.js');
    await freshApp.register(notificationsRoutes);
    await freshApp.ready();

    const res = await freshApp.inject({
      method: 'PATCH',
      url: '/staff/me/notification-prefs',
      payload: { email: false },
    });
    expect(res.statusCode).toBe(404);
    await freshApp.close();
  });

  it('invalidates prefs cache after update', async () => {
    const { invalidateStaffPrefsCache } = await import('../services/notification-prefs.service.js');
    const app = await buildApp();
    await app.inject({
      method: 'PATCH',
      url: '/staff/me/notification-prefs',
      payload: { slack: true },
    });
    expect(vi.mocked(invalidateStaffPrefsCache)).toHaveBeenCalledWith(STAFF_ID);
    await app.close();
  });
});
