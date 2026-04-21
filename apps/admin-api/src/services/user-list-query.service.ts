// User list query — paginated filter by email, kyc_tier, status, date range.
// Uses a single SQL query with optional WHERE clauses to avoid N+1.
import { and, between, count, eq, ilike, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export interface ListUsersFilter {
  q?: string;
  kycTier?: 'none' | 'basic' | 'enhanced';
  status?: 'active' | 'suspended' | 'closed';
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  limit?: number;
}

export interface ListUsersResult {
  data: (typeof schema.users.$inferSelect)[];
  total: number;
  page: number;
}

/**
 * Paginated user list with optional filters.
 * email search: case-insensitive ILIKE %q%.
 * date range: ISO date strings, inclusive on both ends.
 */
export async function listUsers(db: Db, filter: ListUsersFilter = {}): Promise<ListUsersResult> {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const conditions = [];

  if (filter.q) {
    conditions.push(ilike(schema.users.email, `%${filter.q}%`));
  }
  if (filter.kycTier) {
    conditions.push(eq(schema.users.kycTier, filter.kycTier));
  }
  if (filter.status) {
    conditions.push(eq(schema.users.status, filter.status));
  }
  if (filter.createdFrom && filter.createdTo) {
    conditions.push(
      between(
        schema.users.createdAt,
        sql`${filter.createdFrom}::timestamptz`,
        sql`${filter.createdTo}::timestamptz`
      )
    );
  } else if (filter.createdFrom) {
    conditions.push(sql`${schema.users.createdAt} >= ${filter.createdFrom}::timestamptz`);
  } else if (filter.createdTo) {
    conditions.push(sql`${schema.users.createdAt} <= ${filter.createdTo}::timestamptz`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Run data + count queries in parallel
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(schema.users)
      .where(where)
      .orderBy(sql`${schema.users.createdAt} DESC`)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(schema.users).where(where),
  ]);

  const total = countRows[0]?.total ?? 0;

  return { data: rows, total, page };
}
