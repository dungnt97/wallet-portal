import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for staff.routes.ts
// Tests: GET /staff, POST /staff/signing-keys, PATCH /staff/me,
//        POST /staff/me/logout-all, POST /staff/invite,
//        POST /staff/sync-google-workspace, GET /staff/me/sessions,
//        GET /staff/:id/sessions, GET /staff/login-history
// Uses Fastify inject + mocked DB/services — no real Postgres
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/account-settings.service.js', () => ({
  updateProfile: vi.fn(),
}));

vi.mock('../services/staff-invite.service.js', () => ({
  inviteStaff: vi.fn(),
}));

vi.mock('../services/staff-sync-google.service.js', () => ({
  syncGoogleWorkspace: vi.fn(),
  StubError: class StubError extends Error {
    code = 'NOT_IMPLEMENTED';
    constructor(m: string) {
      super(m);
      this.name = 'StubError';
    }
  },
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const STAFF_ID_2 = '00000000-0000-0000-0000-000000000002';
const KEY_ID = '00000000-0000-0000-0000-000000000003';

function makeStaffRow(overrides: Record<string, unknown> = {}) {
  return {
    id: STAFF_ID,
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin' as const,
    status: 'active' as const,
    lastLoginAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    staffId: STAFF_ID,
    success: true,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    failureReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Build a select mock that dispatches based on the presence of field shapes.
 * staffRows      → called with no args or unknown args → returns rows list chain
 * countValue     → called with { value: count() } → returns [{ value: N }]
 * loginHistory   → called with { staffName: ... } → returns leftJoin chain
 * sessionRows    → called with no args (sessions) → .where().orderBy().limit().offset()
 */
function makeSelectMock(opts: {
  staffRows?: Record<string, unknown>[];
  staffCount?: number;
  sessionRows?: Record<string, unknown>[];
  sessionCount?: number;
  loginHistoryRows?: Record<string, unknown>[];
}) {
  const staffRows = opts.staffRows ?? [makeStaffRow()];
  const staffCount = opts.staffCount ?? staffRows.length;
  const sessionRows = opts.sessionRows ?? [makeSessionRow()];
  const sessionCount = opts.sessionCount ?? sessionRows.length;
  const loginHistoryRows = opts.loginHistoryRows ?? [];

  // Track call sequence per endpoint type using a simple counter
  // Staff list: call 1 → rows, call 2 → count
  // Sessions:   call 1 → rows, call 2 → count
  let callN = 0;

  return vi.fn((fields?: unknown) => {
    callN++;
    const f = fields as Record<string, unknown> | undefined;

    // login-history join query: has 'staffName' field
    if (f && 'staffName' in f) {
      return {
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(loginHistoryRows),
            }),
          }),
        }),
      };
    }

    // count query: has 'value' field (e.g. { value: count() })
    if (f && 'value' in f) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: callN <= 2 ? staffCount : sessionCount }]),
        }),
      };
    }

    // No-arg select → staff list (odd calls) or session list (even calls in session endpoints)
    // Use alternating pattern: staff list = pairs (rows, count), sessions = pairs (rows, count)
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(callN <= 2 ? staffRows : sessionRows),
            }),
          }),
        }),
      }),
    };
  });
}

async function buildApp(
  opts: {
    staffRows?: Record<string, unknown>[];
    staffCount?: number;
    staffMemberById?: Record<string, unknown> | null;
    signingKeyInsertRow?: Record<string, unknown> | null;
    sessionRows?: Record<string, unknown>[];
    sessionCount?: number;
    loginHistoryRows?: Record<string, unknown>[];
    updateProfileFn?: (...args: unknown[]) => Promise<unknown>;
    inviteStaffFn?: (...args: unknown[]) => Promise<unknown>;
    syncGoogleFn?: (...args: unknown[]) => Promise<unknown>;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const signingKeyRow = opts.signingKeyInsertRow ?? {
    id: KEY_ID,
    staffId: STAFF_ID,
    chain: 'bnb',
    address: '0xABCDEF',
    tier: 'hot',
    walletType: 'metamask',
    hwAttested: false,
    registeredAt: new Date('2026-01-01T00:00:00Z'),
    revokedAt: null,
  };

  const selectMock = makeSelectMock({
    ...(opts.staffRows !== undefined && { staffRows: opts.staffRows }),
    ...(opts.staffCount !== undefined && { staffCount: opts.staffCount }),
    ...(opts.sessionRows !== undefined && { sessionRows: opts.sessionRows }),
    ...(opts.sessionCount !== undefined && { sessionCount: opts.sessionCount }),
    ...(opts.loginHistoryRows !== undefined && { loginHistoryRows: opts.loginHistoryRows }),
  });

  const mockDb = {
    query: {
      staffMembers: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            opts.staffMemberById === undefined ? makeStaffRow() : opts.staffMemberById
          ),
      },
    },
    select: selectMock,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(signingKeyRow ? [signingKeyRow] : []),
      }),
    }),
  };

  app.decorate('db', mockDb as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
      steppedUpAt: new Date(Date.now() - 60 * 1000),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as unknown as typeof req.session;
  });

  const { updateProfile } = await import('../services/account-settings.service.js');
  const { inviteStaff } = await import('../services/staff-invite.service.js');
  const { syncGoogleWorkspace } = await import('../services/staff-sync-google.service.js');

  vi.mocked(updateProfile).mockImplementation(
    (opts.updateProfileFn as typeof updateProfile | undefined) ??
      (async () => ({
        id: STAFF_ID,
        name: 'Updated Name',
        email: 'admin@example.com',
        localePref: 'en',
      }))
  );

  vi.mocked(inviteStaff).mockImplementation(
    (opts.inviteStaffFn as typeof inviteStaff | undefined) ??
      (async () => ({
        staffId: STAFF_ID_2,
        inviteLink: 'https://admin.example.com/invite/token123',
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      }))
  );

  vi.mocked(syncGoogleWorkspace).mockImplementation(
    (opts.syncGoogleFn as typeof syncGoogleWorkspace | undefined) ??
      (async () => ({
        synced: 5,
        created: 2,
        updated: 3,
        offboarded: 0,
        durationMs: 1200,
      }))
  );

  const { default: staffRoutes } = await import('../routes/staff.routes.js');
  await app.register(staffRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /staff ─────────────────────────────────────────────────────────

describe('GET /staff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated staff list', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/staff?page=1&limit=20' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(STAFF_ID);
    expect(body.page).toBe(1);
    await app.close();
  });

  it('filters by role', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/staff?page=1&limit=20&role=admin' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('filters by status', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/staff?page=1&limit=20&status=active' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('maps invited status to active for display', async () => {
    const rows = [makeStaffRow({ status: 'invited' })];
    const app = await buildApp({ staffRows: rows });
    const res = await app.inject({ method: 'GET', url: '/staff?page=1&limit=20' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].status).toBe('active');
    await app.close();
  });

  it('returns empty list', async () => {
    const app = await buildApp({ staffRows: [], staffCount: 0 });
    const res = await app.inject({ method: 'GET', url: '/staff?page=1&limit=20' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    await app.close();
  });
});

// ── Tests: POST /staff/signing-keys ──────────────────────────────────────────

describe('POST /staff/signing-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a signing key', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/staff/signing-keys',
      payload: {
        staffId: STAFF_ID,
        chain: 'bnb',
        address: '0xABCDEF',
        tier: 'hot',
        walletType: 'metamask',
        hwAttested: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(KEY_ID);
    expect(body.chain).toBe('bnb');
    await app.close();
  });

  it('returns 400 when staff member not found', async () => {
    const app = await buildApp({ staffMemberById: null });
    const res = await app.inject({
      method: 'POST',
      url: '/staff/signing-keys',
      payload: {
        staffId: STAFF_ID,
        chain: 'bnb',
        address: '0xABCDEF',
        tier: 'hot',
        walletType: 'metamask',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 400 for invalid chain', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/staff/signing-keys',
      payload: {
        staffId: STAFF_ID,
        chain: 'eth',
        address: '0xABCDEF',
        tier: 'hot',
        walletType: 'metamask',
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('normalises unknown walletType to other', async () => {
    const app = await buildApp({
      signingKeyInsertRow: {
        id: KEY_ID,
        staffId: STAFF_ID,
        chain: 'bnb',
        address: '0xABCDEF',
        tier: 'hot',
        walletType: 'trezor', // 'trezor' is accepted at DB but normalised to 'other' in output
        hwAttested: true,
        registeredAt: new Date('2026-01-01T00:00:00Z'),
        revokedAt: null,
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/staff/signing-keys',
      payload: {
        staffId: STAFF_ID,
        chain: 'bnb',
        address: '0xABCDEF',
        tier: 'cold',
        walletType: 'trezor',
        hwAttested: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.walletType).toBe('other');
    await app.close();
  });
});

// ── Tests: PATCH /staff/me ────────────────────────────────────────────────────

describe('PATCH /staff/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates name', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/staff/me',
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Updated Name');
    await app.close();
  });

  it('updates locale preference', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/staff/me',
      payload: { localePref: 'vi' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 400 when update service throws', async () => {
    const app = await buildApp({
      updateProfileFn: async () => {
        throw new Error('DB constraint');
      },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: '/staff/me',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('VALIDATION_ERROR');
    await app.close();
  });
});

// ── Tests: POST /staff/me/logout-all ─────────────────────────────────────────

describe('POST /staff/me/logout-all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('destroys session and returns message', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/staff/me/logout-all' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toContain('Session destroyed');
    await app.close();
  });
});

// ── Tests: POST /staff/invite ─────────────────────────────────────────────────

describe('POST /staff/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates invite and returns 201', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/staff/invite',
      payload: { email: 'new@example.com', name: 'New Staff', role: 'operator' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.staffId).toBe(STAFF_ID_2);
    expect(body.inviteLink).toContain('https://');
    await app.close();
  });

  it('returns 400 when invite service throws', async () => {
    const app = await buildApp({
      inviteStaffFn: async () => {
        throw new Error('Email already exists');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/staff/invite',
      payload: { email: 'existing@example.com', name: 'Dup', role: 'viewer' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('INVITE_ERROR');
    await app.close();
  });

  it('returns 400 for invalid role', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/staff/invite',
      payload: { email: 'new@example.com', name: 'Staff', role: 'superadmin' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: POST /staff/sync-google-workspace ──────────────────────────────────

describe('POST /staff/sync-google-workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs workspace and returns stats', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/staff/sync-google-workspace' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.synced).toBe(5);
    expect(body.created).toBe(2);
    await app.close();
  });

  it('returns 501 when StubError thrown', async () => {
    const { StubError } = await import('../services/staff-sync-google.service.js');
    const app = await buildApp({
      syncGoogleFn: async () => {
        throw new StubError('Not configured');
      },
    });
    const res = await app.inject({ method: 'POST', url: '/staff/sync-google-workspace' });
    expect(res.statusCode).toBe(501);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_IMPLEMENTED');
    await app.close();
  });
});

// ── Tests: GET /staff/me/sessions ────────────────────────────────────────────
// Sessions route calls select() for rows, then select({ value: count() }) for total.
// We build a dedicated app per test with a tightly controlled mock to avoid cross-contamination.

describe('GET /staff/me/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns own session history', async () => {
    const sessionRow = makeSessionRow();

    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    let selectCall = 0;
    const mockDb = {
      query: { staffMembers: { findFirst: vi.fn().mockResolvedValue(makeStaffRow()) } },
      select: vi.fn((fields?: unknown) => {
        selectCall++;
        const f = fields as Record<string, unknown> | undefined;
        if (f && 'value' in f) {
          return {
            from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ value: 1 }]) }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([sessionRow]) }),
              }),
            }),
          }),
        };
      }),
      insert: vi.fn(),
    };

    app.decorate('db', mockDb as never);
    app.addHook('preHandler', async (req) => {
      req.session = {
        staff: { id: STAFF_ID, role: 'admin' },
        destroy: vi.fn().mockResolvedValue(undefined),
      } as unknown as typeof req.session;
    });

    const { updateProfile } = await import('../services/account-settings.service.js');
    const { inviteStaff } = await import('../services/staff-invite.service.js');
    const { syncGoogleWorkspace } = await import('../services/staff-sync-google.service.js');
    vi.mocked(updateProfile).mockResolvedValue({
      id: STAFF_ID,
      name: 'x',
      email: 'x@x.com',
      localePref: 'en',
    } as never);
    vi.mocked(inviteStaff).mockResolvedValue({} as never);
    vi.mocked(syncGoogleWorkspace).mockResolvedValue({} as never);

    const { default: staffRoutes } = await import('../routes/staff.routes.js');
    await app.register(staffRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/staff/me/sessions?page=1&limit=20' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.page).toBe(1);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].id).toBe(sessionRow.id);
    await app.close();
  });
});

// ── Tests: GET /staff/:id/sessions ───────────────────────────────────────────

describe('GET /staff/:id/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns session history for specific staff', async () => {
    const sessionRow = makeSessionRow({ staffId: STAFF_ID_2 });

    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const mockDb = {
      query: { staffMembers: { findFirst: vi.fn().mockResolvedValue(makeStaffRow()) } },
      select: vi.fn((fields?: unknown) => {
        const f = fields as Record<string, unknown> | undefined;
        if (f && 'value' in f) {
          return {
            from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ value: 1 }]) }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([sessionRow]) }),
              }),
            }),
          }),
        };
      }),
      insert: vi.fn(),
    };

    app.decorate('db', mockDb as never);
    app.addHook('preHandler', async (req) => {
      req.session = {
        staff: { id: STAFF_ID, role: 'admin' },
        destroy: vi.fn().mockResolvedValue(undefined),
      } as unknown as typeof req.session;
    });

    const { updateProfile } = await import('../services/account-settings.service.js');
    const { inviteStaff } = await import('../services/staff-invite.service.js');
    const { syncGoogleWorkspace } = await import('../services/staff-sync-google.service.js');
    vi.mocked(updateProfile).mockResolvedValue({
      id: STAFF_ID,
      name: 'x',
      email: 'x@x.com',
      localePref: 'en',
    } as never);
    vi.mocked(inviteStaff).mockResolvedValue({} as never);
    vi.mocked(syncGoogleWorkspace).mockResolvedValue({} as never);

    const { default: staffRoutes } = await import('../routes/staff.routes.js');
    await app.register(staffRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: `/staff/${STAFF_ID_2}/sessions?page=1&limit=20`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.page).toBe(1);
    expect(Array.isArray(body.data)).toBe(true);
    await app.close();
  });
});

// ── Tests: GET /staff/login-history ──────────────────────────────────────────

describe('GET /staff/login-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns global login history', async () => {
    const loginRow = {
      id: '00000000-0000-0000-0000-000000000020',
      staffId: STAFF_ID,
      staffName: 'Admin User',
      email: 'admin@example.com',
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      success: true,
      failureReason: null,
      at: new Date('2026-01-01T00:00:00Z'),
    };

    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const mockDb = {
      query: { staffMembers: { findFirst: vi.fn().mockResolvedValue(makeStaffRow()) } },
      select: vi.fn((fields?: unknown) => {
        const f = fields as Record<string, unknown> | undefined;
        // login-history: has 'staffName'
        if (f && 'staffName' in f) {
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([loginRow]),
                }),
              }),
            }),
          };
        }
        // count
        if (f && 'value' in f) {
          return {
            from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ value: 1 }]) }),
          };
        }
        // list
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockReturnValue({ offset: vi.fn().mockResolvedValue([makeStaffRow()]) }),
              }),
            }),
          }),
        };
      }),
      insert: vi.fn(),
    };

    app.decorate('db', mockDb as never);
    app.addHook('preHandler', async (req) => {
      req.session = {
        staff: { id: STAFF_ID, role: 'admin' },
        destroy: vi.fn().mockResolvedValue(undefined),
      } as unknown as typeof req.session;
    });

    const { updateProfile } = await import('../services/account-settings.service.js');
    const { inviteStaff } = await import('../services/staff-invite.service.js');
    const { syncGoogleWorkspace } = await import('../services/staff-sync-google.service.js');
    vi.mocked(updateProfile).mockResolvedValue({
      id: STAFF_ID,
      name: 'x',
      email: 'x@x.com',
      localePref: 'en',
    } as never);
    vi.mocked(inviteStaff).mockResolvedValue({} as never);
    vi.mocked(syncGoogleWorkspace).mockResolvedValue({} as never);

    const { default: staffRoutes } = await import('../routes/staff.routes.js');
    await app.register(staffRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/staff/login-history?limit=50' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].staffName).toBe('Admin User');
    await app.close();
  });

  it('maps MFA failure reason to mfa_failed', async () => {
    const loginRow = {
      id: '00000000-0000-0000-0000-000000000021',
      staffId: STAFF_ID,
      staffName: 'Admin User',
      email: 'admin@example.com',
      ip: '10.0.0.1',
      userAgent: 'curl',
      success: false,
      failureReason: 'MFA code expired',
      at: new Date('2026-01-01T00:00:00Z'),
    };

    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const mockDb = {
      query: { staffMembers: { findFirst: vi.fn().mockResolvedValue(makeStaffRow()) } },
      select: vi.fn((fields?: unknown) => {
        const f = fields as Record<string, unknown> | undefined;
        if (f && 'staffName' in f) {
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([loginRow]) }),
              }),
            }),
          };
        }
        if (f && 'value' in f) {
          return {
            from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ value: 1 }]) }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockReturnValue({ offset: vi.fn().mockResolvedValue([makeStaffRow()]) }),
              }),
            }),
          }),
        };
      }),
      insert: vi.fn(),
    };

    app.decorate('db', mockDb as never);
    app.addHook('preHandler', async (req) => {
      req.session = {
        staff: { id: STAFF_ID, role: 'admin' },
        destroy: vi.fn().mockResolvedValue(undefined),
      } as unknown as typeof req.session;
    });

    const { updateProfile } = await import('../services/account-settings.service.js');
    const { inviteStaff } = await import('../services/staff-invite.service.js');
    const { syncGoogleWorkspace } = await import('../services/staff-sync-google.service.js');
    vi.mocked(updateProfile).mockResolvedValue({
      id: STAFF_ID,
      name: 'x',
      email: 'x@x.com',
      localePref: 'en',
    } as never);
    vi.mocked(inviteStaff).mockResolvedValue({} as never);
    vi.mocked(syncGoogleWorkspace).mockResolvedValue({} as never);

    const { default: staffRoutes } = await import('../routes/staff.routes.js');
    await app.register(staffRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/staff/login-history?limit=10' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].result).toBe('mfa_failed');
    await app.close();
  });
});
