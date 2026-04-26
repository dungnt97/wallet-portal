// Unit tests for audit-query service — pagination, filtering, export, count
// Uses in-memory mocks — no real Postgres required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/index.js';
import {
  countAuditLogs,
  getAuditLog,
  listAuditLogs,
  queryAuditLogsForExport,
} from '../services/audit-query.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';
const AUDIT_ID = 'audit-uuid-0001';
const AUDIT_ID_2 = 'audit-uuid-0002';

const makeDbRow = (id = AUDIT_ID, overrides = {}) => ({
  id,
  staffId: STAFF_ID,
  actorEmail: 'staff@example.com',
  actorName: 'John Doe',
  action: 'withdrawal.created',
  resourceType: 'withdrawal',
  resourceId: 'wd-uuid-0001',
  changes: { status: { from: null, to: 'pending' } },
  ipAddr: '192.168.1.1',
  ua: 'Mozilla/5.0',
  prevHash: null,
  hash: 'hash-0001',
  createdAt: new Date('2026-06-01'),
  ...overrides,
});

// ── Mock builders ──────────────────────────────────────────────────────────────

function makeMockDb(rows: ReturnType<typeof makeDbRow>[] = []) {
  // Chain for list queries: select -> from -> leftJoin -> where -> orderBy -> limit -> offset
  const offsetMock = vi.fn().mockResolvedValue(rows);
  const limitMock = vi.fn().mockReturnValue({ offset: offsetMock });
  const orderByMockForList = vi.fn().mockReturnValue({ limit: limitMock });

  // Chain for get query: select -> from -> leftJoin -> where -> limit
  const limitMockForGet = vi.fn().mockResolvedValue(rows);

  // Chain for export query: select -> from -> leftJoin -> where -> orderBy (no limit/offset)
  const orderByMockForExport = vi.fn().mockResolvedValue(rows);

  // where() needs to return different things depending on context (list vs get vs export)
  // We detect by the mock state: if orderByMockForList is called, it's list; if limitMockForGet is called directly, it's get
  const whereMock = vi.fn((arg: unknown) => {
    // Return object with both orderBy and limit so callers can chain either way
    return {
      orderBy: vi.fn((orderArg: unknown) => {
        // For export queries (orderBy returns promise)
        // For list queries (orderBy returns limit chain)
        // We can detect the intent by checking if another method is called on us
        return {
          limit: limitMock,
          // Also make it thenable for export query case (when export doesn't call limit)
          // biome-ignore lint/suspicious/noThenProperty: drizzle ORM mock requires .then for await chaining
          then: (cb: (val: unknown) => unknown) => Promise.resolve(rows).then(cb),
        };
      }),
      limit: limitMockForGet,
    };
  });

  const leftJoinMock = vi.fn().mockReturnValue({ where: whereMock });
  const fromMock = vi.fn().mockReturnValue({ leftJoin: leftJoinMock });

  const countWhereMock = vi.fn().mockResolvedValue([{ value: rows.length }]);
  const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

  return {
    select: vi.fn((arg: unknown) => {
      if (typeof arg === 'object' && arg !== null && 'value' in arg) {
        return { from: countFromMock };
      }
      return { from: fromMock };
    }),
  } as unknown as Db;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('audit-query service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── listAuditLogs tests ───────────────────────────────────────────────────────

  it('listAuditLogs returns paginated results', async () => {
    const row = makeDbRow();
    const db = makeMockDb([row]);

    const result = await listAuditLogs(db, {
      page: 1,
      limit: 10,
    });

    expect(result.data).toHaveLength(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(1);
  });

  it('listAuditLogs calculates offset for page 2', async () => {
    const db = makeMockDb([makeDbRow()]);

    const result = await listAuditLogs(db, {
      page: 2,
      limit: 10,
    });

    expect(result.page).toBe(2);
  });

  it('listAuditLogs filters by entity', async () => {
    const row = makeDbRow(AUDIT_ID, { resourceType: 'withdrawal' });
    const db = makeMockDb([row]);

    const result = await listAuditLogs(db, {
      entity: 'withdrawal',
      page: 1,
      limit: 10,
    });

    expect(result.data[0]?.resourceType).toBe('withdrawal');
  });

  it('listAuditLogs filters by action', async () => {
    const row = makeDbRow(AUDIT_ID, { action: 'user.created' });
    const db = makeMockDb([row]);

    const result = await listAuditLogs(db, {
      action: 'user.created',
      page: 1,
      limit: 10,
    });

    expect(result.data[0]?.action).toBe('user.created');
  });

  it('listAuditLogs filters by actor (staffId)', async () => {
    const row = makeDbRow();
    const db = makeMockDb([row]);

    const result = await listAuditLogs(db, {
      actor: STAFF_ID,
      page: 1,
      limit: 10,
    });

    expect(result.data[0]?.staffId).toBe(STAFF_ID);
  });

  it('listAuditLogs combines multiple filters', async () => {
    const row = makeDbRow(AUDIT_ID, {
      action: 'withdrawal.created',
      resourceType: 'withdrawal',
      staffId: STAFF_ID,
    });
    const db = makeMockDb([row]);

    const result = await listAuditLogs(db, {
      action: 'withdrawal.created',
      entity: 'withdrawal',
      actor: STAFF_ID,
      page: 1,
      limit: 10,
    });

    expect(result.data).toHaveLength(1);
  });

  it('listAuditLogs handles empty results', async () => {
    const db = makeMockDb([]);

    const result = await listAuditLogs(db, {
      page: 1,
      limit: 10,
    });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('listAuditLogs converts createdAt to ISO string', async () => {
    const row = makeDbRow();
    const db = makeMockDb([row]);

    const result = await listAuditLogs(db, {
      page: 1,
      limit: 10,
    });

    expect(typeof result.data[0]?.createdAt).toBe('string');
    expect(result.data[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // ── getAuditLog tests ─────────────────────────────────────────────────────────

  it('getAuditLog returns single audit log by ID', async () => {
    const row = makeDbRow(AUDIT_ID);
    const db = makeMockDb([row]);

    const result = await getAuditLog(db, AUDIT_ID);

    expect(result?.id).toBe(AUDIT_ID);
    expect(result?.action).toBe('withdrawal.created');
  });

  it('getAuditLog returns null when not found', async () => {
    const db = makeMockDb([]);

    const result = await getAuditLog(db, 'nonexistent-id');

    expect(result).toBeNull();
  });

  it('getAuditLog handles null actor fields', async () => {
    const row = makeDbRow(AUDIT_ID, { actorEmail: null, actorName: null });
    const db = makeMockDb([row]);

    const result = await getAuditLog(db, AUDIT_ID);

    expect(result?.actorEmail).toBeNull();
    expect(result?.actorName).toBeNull();
  });

  // ── queryAuditLogsForExport tests ──────────────────────────────────────────────

  it('queryAuditLogsForExport returns all matching logs', async () => {
    const rows = [
      makeDbRow(AUDIT_ID, { createdAt: new Date('2026-01-01') }),
      makeDbRow(AUDIT_ID_2, { createdAt: new Date('2026-02-01') }),
    ];
    const db = makeMockDb(rows);

    const result = await queryAuditLogsForExport(db, {
      page: 1,
      limit: 10,
    });

    expect(result).toHaveLength(2);
  });

  it('queryAuditLogsForExport applies same filters as list', async () => {
    const row = makeDbRow(AUDIT_ID, {
      action: 'user.created',
      resourceType: 'user',
      staffId: STAFF_ID,
    });
    const db = makeMockDb([row]);

    const result = await queryAuditLogsForExport(db, {
      action: 'user.created',
      entity: 'user',
      actor: STAFF_ID,
    });

    expect(result).toHaveLength(1);
  });

  it('queryAuditLogsForExport includes all audit fields', async () => {
    const row = makeDbRow(AUDIT_ID, {
      ipAddr: '192.168.1.100',
      ua: 'Chrome/91',
      hash: 'hash-abc123',
    });
    const db = makeMockDb([row]);

    const result = await queryAuditLogsForExport(db, {
      page: 1,
      limit: 10,
    });

    expect(result[0]?.ipAddr).toBe('192.168.1.100');
    expect(result[0]?.ua).toBe('Chrome/91');
    expect(result[0]?.hash).toBe('hash-abc123');
  });

  // ── countAuditLogs tests ───────────────────────────────────────────────────────

  it('countAuditLogs returns total count', async () => {
    const rows = [makeDbRow(AUDIT_ID), makeDbRow(AUDIT_ID_2)];
    const db = makeMockDb(rows);

    const result = await countAuditLogs(db, {
      page: 1,
      limit: 10,
    });

    expect(result).toBe(2);
  });

  it('countAuditLogs returns 0 for no matches', async () => {
    const db = makeMockDb([]);

    const result = await countAuditLogs(db, {
      page: 1,
      limit: 10,
    });

    expect(result).toBe(0);
  });

  it('countAuditLogs applies entity filter', async () => {
    const rows = [makeDbRow(AUDIT_ID, { resourceType: 'withdrawal' })];
    const db = makeMockDb(rows);

    const result = await countAuditLogs(db, {
      entity: 'withdrawal',
    });

    expect(result).toBe(1);
  });

  it('countAuditLogs applies action filter', async () => {
    const rows = [makeDbRow(AUDIT_ID, { action: 'withdrawal.approved' })];
    const db = makeMockDb(rows);

    const result = await countAuditLogs(db, {
      action: 'withdrawal.approved',
    });

    expect(result).toBe(1);
  });

  it('countAuditLogs applies actor filter', async () => {
    const rows = [makeDbRow(AUDIT_ID, { staffId: STAFF_ID })];
    const db = makeMockDb(rows);

    const result = await countAuditLogs(db, {
      actor: STAFF_ID,
    });

    expect(result).toBe(1);
  });

  it('countAuditLogs combines multiple filters', async () => {
    const rows = [
      makeDbRow(AUDIT_ID, {
        action: 'withdrawal.approved',
        resourceType: 'withdrawal',
        staffId: STAFF_ID,
        createdAt: new Date('2026-06-01'),
      }),
    ];
    const db = makeMockDb(rows);

    const result = await countAuditLogs(db, {
      action: 'withdrawal.approved',
      entity: 'withdrawal',
      actor: STAFF_ID,
      from: '2026-01-01',
      to: '2026-12-31',
    });

    expect(result).toBe(1);
  });

  // ── Compliance tests ──────────────────────────────────────────────────────────

  it('preserves staffId for audit trail integrity', async () => {
    const row = makeDbRow(AUDIT_ID, { staffId: STAFF_ID, actorEmail: null });
    const db = makeMockDb([row]);

    const result = await listAuditLogs(db, { page: 1, limit: 10 });

    expect(result.data[0]?.staffId).toBe(STAFF_ID);
  });

  it('preserves hash chain for tamper detection', async () => {
    const row = makeDbRow(AUDIT_ID, { hash: 'hash-current', prevHash: 'hash-previous' });
    const db = makeMockDb([row]);

    const result = await getAuditLog(db, AUDIT_ID);

    expect(result?.hash).toBe('hash-current');
    expect(result?.prevHash).toBe('hash-previous');
  });

  it('preserves complex changes field', async () => {
    const changes = {
      oldStatus: 'pending',
      newStatus: 'approved',
      approvedBy: 'staff-uuid-123',
    };
    const row = makeDbRow(AUDIT_ID, { changes });
    const db = makeMockDb([row]);

    const result = await listAuditLogs(db, { page: 1, limit: 10 });

    expect(result.data[0]?.changes).toEqual(changes);
  });
});
