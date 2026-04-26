import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for audit.routes.ts
// Tests: GET /audit-logs, GET /audit-logs/verify, GET /audit-logs/export.csv,
//        GET /audit-logs/:id
// Uses Fastify inject + mocked audit services — no real Postgres
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/audit-query.service.js', () => ({
  listAuditLogs: vi.fn(),
  getAuditLog: vi.fn(),
  countAuditLogs: vi.fn(),
  queryAuditLogsForExport: vi.fn(),
}));

vi.mock('../services/audit-verify.service.js', () => ({
  verifyChain: vi.fn(),
}));

vi.mock('../services/audit-csv.service.js', () => ({
  csvHeader: 'id,staffId,action,resourceType,createdAt',
  streamAuditCsv: vi.fn(),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const AUDIT_ID = '00000000-0000-0000-0000-000000000002';

function makeAuditLog(overrides: Record<string, unknown> = {}) {
  return {
    id: AUDIT_ID,
    staffId: STAFF_ID,
    actorEmail: 'admin@example.com',
    actorName: 'Admin User',
    action: 'user.kyc_updated',
    resourceType: 'user',
    resourceId: '00000000-0000-0000-0000-000000000010',
    changes: { kycTier: { from: 'none', to: 'basic' } },
    ipAddr: '127.0.0.1',
    ua: 'Mozilla/5.0',
    prevHash: null,
    hash: 'abc123hash',
    createdAt: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

async function buildApp(
  opts: {
    listAuditLogsFn?: (...args: unknown[]) => Promise<unknown>;
    getAuditLogFn?: (...args: unknown[]) => Promise<unknown>;
    countAuditLogsFn?: (...args: unknown[]) => Promise<unknown>;
    queryForExportFn?: (...args: unknown[]) => Promise<unknown>;
    verifyChainFn?: (...args: unknown[]) => Promise<unknown>;
    streamCsvFn?: (...args: unknown[]) => void;
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // audit routes use app.db only via the service calls (fully mocked)
  app.decorate('db', {} as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { listAuditLogs, getAuditLog, countAuditLogs, queryAuditLogsForExport } = await import(
    '../services/audit-query.service.js'
  );
  const { verifyChain } = await import('../services/audit-verify.service.js');
  const { streamAuditCsv } = await import('../services/audit-csv.service.js');

  vi.mocked(listAuditLogs).mockImplementation(
    opts.listAuditLogsFn ??
      (async () => ({
        data: [makeAuditLog()],
        total: 1,
        page: 1,
        limit: 50,
      }))
  );

  vi.mocked(getAuditLog).mockImplementation(opts.getAuditLogFn ?? (async () => makeAuditLog()));

  vi.mocked(countAuditLogs).mockImplementation(opts.countAuditLogsFn ?? (async () => 5));

  vi.mocked(queryAuditLogsForExport).mockImplementation(
    opts.queryForExportFn ?? (async () => [makeAuditLog()])
  );

  vi.mocked(verifyChain).mockImplementation(
    opts.verifyChainFn ?? (async () => ({ verified: true, checked: 10 }))
  );

  vi.mocked(streamAuditCsv).mockImplementation(
    opts.streamCsvFn ??
      ((rows: unknown, chunk: (s: string) => void) => {
        chunk(`id,staffId,action\n${AUDIT_ID},${STAFF_ID},user.kyc_updated\n`);
      })
  );

  const { default: auditRoutes } = await import('../routes/audit.routes.js');
  await app.register(auditRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /audit-logs ────────────────────────────────────────────────────

describe('GET /audit-logs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated audit log list', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/audit-logs?page=1&limit=50' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(AUDIT_ID);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    await app.close();
  });

  it('passes entity filter to listAuditLogs', async () => {
    const { listAuditLogs } = await import('../services/audit-query.service.js');
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/audit-logs?entity=user&page=1&limit=50' });
    expect(vi.mocked(listAuditLogs)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entity: 'user' })
    );
    await app.close();
  });

  it('passes actor filter to listAuditLogs', async () => {
    const { listAuditLogs } = await import('../services/audit-query.service.js');
    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: `/audit-logs?actor=${STAFF_ID}&page=1&limit=50`,
    });
    expect(vi.mocked(listAuditLogs)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actor: STAFF_ID })
    );
    await app.close();
  });

  it('passes action filter to listAuditLogs', async () => {
    const { listAuditLogs } = await import('../services/audit-query.service.js');
    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/audit-logs?action=user.kyc_updated&page=1&limit=50',
    });
    expect(vi.mocked(listAuditLogs)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'user.kyc_updated' })
    );
    await app.close();
  });

  it('passes date range filters to listAuditLogs', async () => {
    const { listAuditLogs } = await import('../services/audit-query.service.js');
    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/audit-logs?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.000Z',
    });
    expect(vi.mocked(listAuditLogs)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-12-31T23:59:59.000Z',
      })
    );
    await app.close();
  });

  it('returns empty list', async () => {
    const app = await buildApp({
      listAuditLogsFn: async () => ({ data: [], total: 0, page: 1, limit: 50 }),
    });
    const res = await app.inject({ method: 'GET', url: '/audit-logs' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    await app.close();
  });
});

// ── Tests: GET /audit-logs/verify ────────────────────────────────────────────

describe('GET /audit-logs/verify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns verified=true when chain is intact', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs/verify?from=2026-01-01T00:00:00.000Z&to=2026-01-31T23:59:59.000Z',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.verified).toBe(true);
    expect(body.checked).toBe(10);
    await app.close();
  });

  it('returns verified=false with brokenAt when chain broken', async () => {
    const app = await buildApp({
      verifyChainFn: async () => ({
        verified: false,
        checked: 5,
        brokenAt: AUDIT_ID,
      }),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs/verify?from=2026-01-01T00:00:00.000Z&to=2026-01-31T23:59:59.000Z',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.verified).toBe(false);
    expect(body.brokenAt).toBe(AUDIT_ID);
    await app.close();
  });

  it('returns 400 when from param is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs/verify?to=2026-01-31T23:59:59.000Z',
    });
    // Route requires both from and to as datetime — missing from triggers 400
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when to param is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs/verify?from=2026-01-01T00:00:00.000Z',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Tests: GET /audit-logs/export.csv ────────────────────────────────────────

describe('GET /audit-logs/export.csv', () => {
  beforeEach(() => vi.clearAllMocks());

  it('streams CSV body when row count under cap', async () => {
    const app = await buildApp({ countAuditLogsFn: async () => 100 });
    const res = await app.inject({ method: 'GET', url: '/audit-logs/export.csv' });
    // inject() captures raw body but not headers set before reply.raw.write/end
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(AUDIT_ID);
    await app.close();
  });

  it('returns 200 with date-filtered export', async () => {
    const app = await buildApp({ countAuditLogsFn: async () => 1 });
    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs/export.csv?from=2026-01-01T00:00:00.000Z&to=2026-01-31T23:59:59.000Z',
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 429 when row count exceeds 50k cap', async () => {
    const app = await buildApp({ countAuditLogsFn: async () => 60_000 });
    const res = await app.inject({ method: 'GET', url: '/audit-logs/export.csv' });
    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('too_many_rows');
    expect(body.max).toBe(50_000);
    expect(body.found).toBe(60_000);
    await app.close();
  });

  it('returns 200 for export with no date filters', async () => {
    const app = await buildApp({ countAuditLogsFn: async () => 10 });
    const res = await app.inject({ method: 'GET', url: '/audit-logs/export.csv' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('passes entity filter to export query', async () => {
    const { countAuditLogs, queryAuditLogsForExport } = await import(
      '../services/audit-query.service.js'
    );
    const app = await buildApp({ countAuditLogsFn: async () => 1 });
    await app.inject({ method: 'GET', url: '/audit-logs/export.csv?entity=withdrawal' });
    expect(vi.mocked(countAuditLogs)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entity: 'withdrawal' })
    );
    expect(vi.mocked(queryAuditLogsForExport)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entity: 'withdrawal' })
    );
    await app.close();
  });
});

// ── Tests: GET /audit-logs/:id ────────────────────────────────────────────────

describe('GET /audit-logs/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns single audit log entry', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/audit-logs/${AUDIT_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(AUDIT_ID);
    expect(body.action).toBe('user.kyc_updated');
    await app.close();
  });

  it('returns 404 when log not found', async () => {
    const app = await buildApp({ getAuditLogFn: async () => null });
    const res = await app.inject({ method: 'GET', url: `/audit-logs/${AUDIT_ID}` });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Not found');
    await app.close();
  });

  it('returns 400 for non-uuid id', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/audit-logs/not-a-uuid' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns null fields correctly', async () => {
    const app = await buildApp({
      getAuditLogFn: async () =>
        makeAuditLog({
          staffId: null,
          actorEmail: null,
          actorName: null,
          resourceId: null,
          changes: null,
          ipAddr: null,
          ua: null,
          prevHash: null,
        }),
    });
    const res = await app.inject({ method: 'GET', url: `/audit-logs/${AUDIT_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.staffId).toBeNull();
    expect(body.actorEmail).toBeNull();
    await app.close();
  });
});
