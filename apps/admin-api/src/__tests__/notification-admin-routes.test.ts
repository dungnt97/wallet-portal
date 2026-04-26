import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for notification-admin.routes.ts
// Tests: GET/POST/PATCH/DELETE /admin/notification-channels,
//        POST /admin/notification-channels/:id/test,
//        GET/PATCH /admin/notification-routing
// Mocks notif-email-transport + global.fetch
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/notif-email-transport.service.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const CHANNEL_ID = '00000000-0000-0000-0000-000000000002';
const RULE_ID = '00000000-0000-0000-0000-000000000003';

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: CHANNEL_ID,
    kind: 'email' as const,
    name: 'ops-email',
    target: 'ops@example.com',
    enabled: true,
    severityFilter: 'info' as const,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    eventType: 'withdrawal.created',
    severity: 'info' as const,
    channelKind: 'email' as const,
    enabled: true,
    ...overrides,
  };
}

async function buildApp(
  opts: {
    channelRows?: ReturnType<typeof makeChannel>[];
    insertReturning?: ReturnType<typeof makeChannel>[];
    updateReturning?: ReturnType<typeof makeChannel>[];
    deleteReturning?: Array<{ id: string }>;
    findChannel?: ReturnType<typeof makeChannel> | null;
    ruleRows?: ReturnType<typeof makeRule>[];
    upsertReturning?: ReturnType<typeof makeRule>[];
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const channelRows = opts.channelRows ?? [makeChannel()];
  const insertReturning = opts.insertReturning ?? [makeChannel()];
  const updateReturning = opts.updateReturning ?? [makeChannel()];
  const deleteReturning = opts.deleteReturning ?? [{ id: CHANNEL_ID }];
  const findChannel = opts.findChannel === undefined ? makeChannel() : opts.findChannel;
  const ruleRows = opts.ruleRows ?? [makeRule()];
  const upsertReturning = opts.upsertReturning ?? [makeRule()];

  // Track calls to dispatch select: channels vs rules vs find-for-test
  let selectCallN = 0;
  const mockSelect = vi.fn(() => {
    selectCallN++;
    if (selectCallN === 1) {
      // GET /admin/notification-channels: orderBy chain
      return {
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(channelRows),
        }),
      };
    }
    if (selectCallN === 2) {
      // POST /:id/test: where chain → single channel
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(findChannel ? [findChannel] : []),
        }),
      };
    }
    // GET /admin/notification-routing: orderBy chain
    return {
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(ruleRows),
      }),
    };
  });

  const mockInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(insertReturning),
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(upsertReturning),
      }),
    }),
  });

  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(updateReturning),
      }),
    }),
  });

  const mockDelete = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(deleteReturning),
    }),
  });

  app.decorate('db', {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  } as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { default: notifAdminRoutes } = await import('../routes/notification-admin.routes.js');
  await app.register(notifAdminRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /admin/notification-channels ───────────────────────────────────

describe('GET /admin/notification-channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns channel list', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/admin/notification-channels' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].id).toBe(CHANNEL_ID);
    expect(body.data[0].name).toBe('ops-email');
    expect(body.data[0].target).toBe('ops@example.com');
    await app.close();
  });

  it('serialises dates as ISO strings', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/admin/notification-channels' });
    const body = JSON.parse(res.body);
    expect(body.data[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });

  it('returns empty array when no channels', async () => {
    const app = await buildApp({ channelRows: [] });
    const res = await app.inject({ method: 'GET', url: '/admin/notification-channels' });
    expect(JSON.parse(res.body).data).toEqual([]);
    await app.close();
  });
});

// ── Tests: POST /admin/notification-channels ──────────────────────────────────

describe('POST /admin/notification-channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates channel and returns 201', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/notification-channels',
      payload: {
        kind: 'email',
        name: 'ops-email',
        target: 'ops@example.com',
        enabled: true,
        severityFilter: 'info',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(CHANNEL_ID);
    expect(body.kind).toBe('email');
    await app.close();
  });

  it('creates slack channel', async () => {
    const app = await buildApp({
      insertReturning: [
        makeChannel({ kind: 'slack', name: 'slack-ops', target: 'https://hooks.slack.com/xxx' }),
      ],
    });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/notification-channels',
      payload: {
        kind: 'slack',
        name: 'slack-ops',
        target: 'https://hooks.slack.com/xxx',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).kind).toBe('slack');
    await app.close();
  });

  it('returns 400 for missing required fields', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/notification-channels',
      payload: { name: 'incomplete' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 for invalid channel kind', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/notification-channels',
      payload: { kind: 'sms', name: 'test', target: '+1234567890' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: PATCH /admin/notification-channels/:id ─────────────────────────────

describe('PATCH /admin/notification-channels/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates channel fields and returns updated row', async () => {
    const app = await buildApp({
      updateReturning: [makeChannel({ enabled: false })],
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/notification-channels/${CHANNEL_ID}`,
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).enabled).toBe(false);
    await app.close();
  });

  it('returns 404 when channel not found', async () => {
    const app = await buildApp({ updateReturning: [] });
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/notification-channels/${CHANNEL_ID}`,
      payload: { name: 'renamed' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 400 for non-uuid id', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/notification-channels/not-a-uuid',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: DELETE /admin/notification-channels/:id ────────────────────────────

describe('DELETE /admin/notification-channels/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes channel and returns ok', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/notification-channels/${CHANNEL_ID}`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    await app.close();
  });

  it('returns 404 when channel not found', async () => {
    const app = await buildApp({ deleteReturning: [] });
    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/notification-channels/${CHANNEL_ID}`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ── Helper: build app dedicated to the test-channel endpoint ─────────────────
// The test endpoint fires select().from().where() as its ONLY (first) select call.

async function buildTestChannelApp(findChannel: ReturnType<typeof makeChannel> | null) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('db', {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(findChannel ? [findChannel] : []),
      }),
    }),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { default: notifAdminRoutes } = await import('../routes/notification-admin.routes.js');
  await app.register(notifAdminRoutes);
  await app.ready();
  return app;
}

// ── Tests: POST /admin/notification-channels/:id/test ────────────────────────

describe('POST /admin/notification-channels/:id/test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  });

  it('fires test to email channel and returns ok', async () => {
    const { sendEmail } = await import('../services/notif-email-transport.service.js');
    const app = await buildTestChannelApp(makeChannel({ kind: 'email' }));
    const res = await app.inject({
      method: 'POST',
      url: `/admin/notification-channels/${CHANNEL_ID}/test`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.channelKind).toBe('email');
    // Allow async fire to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(sendEmail)).toHaveBeenCalled();
    await app.close();
  });

  it('fires test to slack channel via fetch', async () => {
    const app = await buildTestChannelApp(
      makeChannel({ kind: 'slack', target: 'https://hooks.slack.com/xxx' })
    );
    const res = await app.inject({
      method: 'POST',
      url: `/admin/notification-channels/${CHANNEL_ID}/test`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).channelKind).toBe('slack');
    await new Promise((r) => setTimeout(r, 50));
    expect(global.fetch).toHaveBeenCalled();
    await app.close();
  });

  it('returns 404 when channel not found', async () => {
    const app = await buildTestChannelApp(null);
    const res = await app.inject({
      method: 'POST',
      url: `/admin/notification-channels/${CHANNEL_ID}/test`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('accepts optional eventType body field', async () => {
    const app = await buildTestChannelApp(
      makeChannel({ kind: 'webhook', target: 'https://example.com/hook' })
    );
    const res = await app.inject({
      method: 'POST',
      url: `/admin/notification-channels/${CHANNEL_ID}/test`,
      payload: { eventType: 'deposit.detected' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ── Tests: GET /admin/notification-routing ────────────────────────────────────

describe('GET /admin/notification-routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns routing rule list', async () => {
    const app = await buildApp();
    // Need fresh app with fresh select counter starting at routing call
    const freshApp = Fastify({ logger: false });
    freshApp.setValidatorCompiler(validatorCompiler);
    freshApp.setSerializerCompiler(serializerCompiler);
    const rules = [makeRule()];
    freshApp.decorate('db', {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(rules),
        }),
      }),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as never);
    freshApp.addHook('preHandler', async (req) => {
      req.session = { staff: { id: STAFF_ID, role: 'admin' } } as unknown as typeof req.session;
    });
    const { default: notifAdminRoutes } = await import('../routes/notification-admin.routes.js');
    await freshApp.register(notifAdminRoutes);
    await freshApp.ready();

    const res = await freshApp.inject({ method: 'GET', url: '/admin/notification-routing' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].id).toBe(RULE_ID);
    expect(body.data[0].eventType).toBe('withdrawal.created');
    await freshApp.close();
    await app.close();
  });
});

// ── Tests: PATCH /admin/notification-routing ──────────────────────────────────

describe('PATCH /admin/notification-routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts routing rule and returns rule', async () => {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.decorate('db', {
      select: vi.fn(),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([makeRule()]),
          }),
        }),
      }),
      update: vi.fn(),
      delete: vi.fn(),
    } as never);
    app.addHook('preHandler', async (req) => {
      req.session = { staff: { id: STAFF_ID, role: 'admin' } } as unknown as typeof req.session;
    });
    const { default: notifAdminRoutes } = await import('../routes/notification-admin.routes.js');
    await app.register(notifAdminRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/notification-routing',
      payload: {
        eventType: 'withdrawal.created',
        severity: 'info',
        channelKind: 'email',
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(RULE_ID);
    expect(body.eventType).toBe('withdrawal.created');
    await app.close();
  });

  it('returns 400 for missing required fields', async () => {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.decorate('db', {
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as never);
    app.addHook('preHandler', async (req) => {
      req.session = { staff: { id: STAFF_ID, role: 'admin' } } as unknown as typeof req.session;
    });
    const { default: notifAdminRoutes } = await import('../routes/notification-admin.routes.js');
    await app.register(notifAdminRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/notification-routing',
      payload: { eventType: 'withdrawal.created' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
