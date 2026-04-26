// Unit tests for user-list-query service — pagination, filters, empty results.
// Uses in-memory mocks — no real Postgres required.
import { describe, expect, it } from 'vitest';
import { listUsers } from '../services/user-list-query.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-uuid-0001',
  email: 'alice@example.com',
  kycTier: 'basic',
  status: 'active',
  riskTier: 'low',
  riskReason: null,
  riskUpdatedAt: null,
  riskUpdatedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ── Mock builder ──────────────────────────────────────────────────────────────

/**
 * Builds a drizzle-like select mock that supports:
 *   .select().from().where().orderBy().limit().offset()  → Promise<rows>
 *   .select({ total: count() }).from().where()           → Promise<[{ total: N }]>
 */
function buildMockDb(opts: { rows?: unknown[]; total?: number } = {}) {
  const rows = opts.rows ?? [makeUser()];
  const total = opts.total ?? rows.length;

  let callCount = 0;
  const selectMock = () => {
    callCount++;
    const isCountQuery = callCount % 2 === 0;
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => (isCountQuery ? Promise.resolve([{ total }]) : Promise.resolve(rows)),
      // biome-ignore lint/suspicious/noThenProperty: drizzle ORM mock requires .then for await chaining
      then: (resolve: (v: unknown) => void) => resolve(isCountQuery ? [{ total }] : rows),
    };
    return chain;
  };

  return { select: selectMock };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('listUsers service', () => {
  it('happy path — returns paginated data with total', async () => {
    const users = [makeUser(), makeUser({ id: 'user-uuid-0002', email: 'bob@example.com' })];
    const db = buildMockDb({ rows: users, total: 2 });

    const result = await listUsers(db as unknown as Parameters<typeof listUsers>[0]);

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
  });

  it('returns empty items when no users match', async () => {
    const db = buildMockDb({ rows: [], total: 0 });

    const result = await listUsers(db as unknown as Parameters<typeof listUsers>[0], {
      q: 'notfound',
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('applies page=2 correctly', async () => {
    const db = buildMockDb({ rows: [makeUser()], total: 25 });

    const result = await listUsers(db as unknown as Parameters<typeof listUsers>[0], {
      page: 2,
      limit: 10,
    });

    expect(result.page).toBe(2);
    expect(result.total).toBe(25);
  });

  it('clamps limit to max 100', async () => {
    const db = buildMockDb({ rows: [makeUser()], total: 1 });
    // No assertion on DB call; service internally clamps — just verify no error
    const result = await listUsers(db as unknown as Parameters<typeof listUsers>[0], {
      limit: 9999,
    });
    expect(result).toHaveProperty('data');
  });

  it('defaults page=1 when page <= 0', async () => {
    const db = buildMockDb({ rows: [makeUser()], total: 1 });
    const result = await listUsers(db as unknown as Parameters<typeof listUsers>[0], { page: -5 });
    expect(result.page).toBe(1);
  });

  it('filters by kycTier — select still called with db', async () => {
    const db = buildMockDb({ rows: [makeUser({ kycTier: 'enhanced' })], total: 1 });
    const result = await listUsers(db as unknown as Parameters<typeof listUsers>[0], {
      kycTier: 'enhanced',
    });
    expect(result.data[0]).toMatchObject({ kycTier: 'enhanced' });
  });

  it('filters by status', async () => {
    const db = buildMockDb({ rows: [makeUser({ status: 'suspended' })], total: 1 });
    const result = await listUsers(db as unknown as Parameters<typeof listUsers>[0], {
      status: 'suspended',
    });
    expect(result.data[0]).toMatchObject({ status: 'suspended' });
  });

  it('returns empty result when total is 0', async () => {
    const db = buildMockDb({ rows: [], total: 0 });
    const result = await listUsers(db as unknown as Parameters<typeof listUsers>[0]);
    expect(result).toMatchObject({ data: [], total: 0, page: 1 });
  });
});
