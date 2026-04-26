import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for ops-backup.routes.ts
// Tests: POST /ops/backup/pg-dump, GET /ops/backups
// Uses Fastify inject + mocked DB + backupQueue
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const BACKUP_ID = '00000000-0000-0000-0000-000000000002';

function makeBackupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BACKUP_ID,
    triggeredBy: STAFF_ID,
    status: 'done' as const,
    s3Key: 'backups/2026-01-01.tar.gz',
    sizeBytes: BigInt('1048576'),
    durationMs: 4500,
    errorMsg: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: new Date('2026-01-01T00:00:04Z'),
    ...overrides,
  };
}

async function buildApp(
  opts: {
    insertRow?: { id: string } | null;
    backupRows?: Record<string, unknown>[];
  } = {}
) {
  process.env.POLICY_DEV_MODE = 'true';

  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const insertRow = opts.insertRow === undefined ? { id: BACKUP_ID } : opts.insertRow;
  const backupRows = opts.backupRows ?? [makeBackupRow()];

  // insert().values().returning() chain for POST
  const mockInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(insertRow ? [insertRow] : []),
    }),
  });

  // select().from().orderBy().limit() chain for GET
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(backupRows),
      }),
    }),
  });

  const mockBackupQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };

  app.decorate('db', { insert: mockInsert, select: mockSelect } as never);
  app.decorate('backupQueue', mockBackupQueue as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { default: opsBackupRoutes } = await import('../routes/ops-backup.routes.js');
  await app.register(opsBackupRoutes);
  await app.ready();
  return app;
}

// ── Tests: POST /ops/backup/pg-dump ──────────────────────────────────────────

describe('POST /ops/backup/pg-dump', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueues a backup job and returns 202', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/ops/backup/pg-dump' });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.backupId).toBe(BACKUP_ID);
    expect(typeof body.message).toBe('string');
    expect(typeof body.dryRun).toBe('boolean');
    await app.close();
  });

  it('sets dryRun=true when BACKUP_S3_BUCKET is not configured', async () => {
    const prev = process.env.BACKUP_S3_BUCKET;
    // biome-ignore lint/performance/noDelete: need to fully remove the key so !process.env.X is true
    delete process.env.BACKUP_S3_BUCKET;
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/ops/backup/pg-dump' });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).dryRun).toBe(true);
    if (prev !== undefined) process.env.BACKUP_S3_BUCKET = prev;
    await app.close();
  });

  it('sets dryRun=false when BACKUP_S3_BUCKET is set', async () => {
    process.env.BACKUP_S3_BUCKET = 'my-bucket';
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/ops/backup/pg-dump' });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).dryRun).toBe(false);
    // biome-ignore lint/performance/noDelete: restore env to unset state after test
    delete process.env.BACKUP_S3_BUCKET;
    await app.close();
  });
});

// ── Tests: GET /ops/backups ───────────────────────────────────────────────────

describe('GET /ops/backups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns last 20 backup rows', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ops/backups' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(BACKUP_ID);
    await app.close();
  });

  it('serialises sizeBytes bigint as string', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ops/backups' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.data[0].sizeBytes).toBe('string');
    expect(body.data[0].sizeBytes).toBe('1048576');
    await app.close();
  });

  it('serialises dates to ISO strings', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ops/backups' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data[0].completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });

  it('returns null for nullable fields when missing', async () => {
    const app = await buildApp({
      backupRows: [
        makeBackupRow({
          s3Key: null,
          sizeBytes: null,
          durationMs: null,
          errorMsg: null,
          completedAt: null,
        }),
      ],
    });
    const res = await app.inject({ method: 'GET', url: '/ops/backups' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].s3Key).toBeNull();
    expect(body.data[0].sizeBytes).toBeNull();
    expect(body.data[0].completedAt).toBeNull();
    await app.close();
  });

  it('returns empty array when no backups', async () => {
    const app = await buildApp({ backupRows: [] });
    const res = await app.inject({ method: 'GET', url: '/ops/backups' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual([]);
    await app.close();
  });
});
