// Audit query service — paginated list + single row detail
// Uses Drizzle ORM with Postgres, filters on indexed created_at column
import { and, asc, count, desc, eq, gte, isNotNull, lte } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export interface AuditListParams {
  entity?: string | undefined;
  actor?: string | undefined;
  action?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page: number;
  limit: number;
}

export interface AuditLogEntry {
  id: string;
  staffId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  changes: Record<string, unknown> | null;
  ipAddr: string | null;
  ua: string | null;
  prevHash: string | null;
  hash: string;
  createdAt: string;
}

export interface AuditListResult {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

/**
 * List audit logs with optional filters, paginated descending by created_at.
 * Joins staff_members to resolve actor email + name.
 */
export async function listAuditLogs(db: Db, params: AuditListParams): Promise<AuditListResult> {
  const { entity, actor, action, from, to, page, limit } = params;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (entity) conditions.push(eq(schema.auditLog.resourceType, entity));
  if (action) conditions.push(eq(schema.auditLog.action, action));
  if (actor) conditions.push(eq(schema.auditLog.staffId, actor));
  if (from) conditions.push(gte(schema.auditLog.createdAt, new Date(from)));
  if (to) conditions.push(lte(schema.auditLog.createdAt, new Date(to)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: schema.auditLog.id,
        staffId: schema.auditLog.staffId,
        actorEmail: schema.staffMembers.email,
        actorName: schema.staffMembers.name,
        action: schema.auditLog.action,
        resourceType: schema.auditLog.resourceType,
        resourceId: schema.auditLog.resourceId,
        changes: schema.auditLog.changes,
        ipAddr: schema.auditLog.ipAddr,
        ua: schema.auditLog.ua,
        prevHash: schema.auditLog.prevHash,
        hash: schema.auditLog.hash,
        createdAt: schema.auditLog.createdAt,
      })
      .from(schema.auditLog)
      .leftJoin(schema.staffMembers, eq(schema.auditLog.staffId, schema.staffMembers.id))
      .where(where)
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(schema.auditLog).where(where),
  ]);

  const total = Number(countRows[0]?.value ?? 0);

  const data: AuditLogEntry[] = rows.map((r) => ({
    ...r,
    actorEmail: r.actorEmail ?? null,
    actorName: r.actorName ?? null,
    changes: r.changes as Record<string, unknown> | null,
    createdAt: r.createdAt.toISOString(),
  }));

  return { data, total, page, limit };
}

/**
 * Get a single audit log row by ID, with actor info joined.
 */
export async function getAuditLog(db: Db, id: string): Promise<AuditLogEntry | null> {
  const rows = await db
    .select({
      id: schema.auditLog.id,
      staffId: schema.auditLog.staffId,
      actorEmail: schema.staffMembers.email,
      actorName: schema.staffMembers.name,
      action: schema.auditLog.action,
      resourceType: schema.auditLog.resourceType,
      resourceId: schema.auditLog.resourceId,
      changes: schema.auditLog.changes,
      ipAddr: schema.auditLog.ipAddr,
      ua: schema.auditLog.ua,
      prevHash: schema.auditLog.prevHash,
      hash: schema.auditLog.hash,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .leftJoin(schema.staffMembers, eq(schema.auditLog.staffId, schema.staffMembers.id))
    .where(eq(schema.auditLog.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    actorEmail: row.actorEmail ?? null,
    actorName: row.actorName ?? null,
    changes: row.changes as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Export query: returns rows ordered ASC by created_at for streaming.
 * Includes actor email for CSV join. Applies same filters as list.
 */
export async function queryAuditLogsForExport(
  db: Db,
  params: Omit<AuditListParams, 'page' | 'limit'>
): Promise<AuditLogEntry[]> {
  const { entity, actor, action, from, to } = params;

  const conditions: ReturnType<typeof eq>[] = [];
  if (entity) conditions.push(eq(schema.auditLog.resourceType, entity));
  if (action) conditions.push(eq(schema.auditLog.action, action));
  if (actor) conditions.push(eq(schema.auditLog.staffId, actor));
  if (from) conditions.push(gte(schema.auditLog.createdAt, new Date(from)));
  if (to) conditions.push(lte(schema.auditLog.createdAt, new Date(to)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: schema.auditLog.id,
      staffId: schema.auditLog.staffId,
      actorEmail: schema.staffMembers.email,
      actorName: schema.staffMembers.name,
      action: schema.auditLog.action,
      resourceType: schema.auditLog.resourceType,
      resourceId: schema.auditLog.resourceId,
      changes: schema.auditLog.changes,
      ipAddr: schema.auditLog.ipAddr,
      ua: schema.auditLog.ua,
      prevHash: schema.auditLog.prevHash,
      hash: schema.auditLog.hash,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .leftJoin(schema.staffMembers, eq(schema.auditLog.staffId, schema.staffMembers.id))
    .where(where)
    .orderBy(asc(schema.auditLog.createdAt));

  return rows.map((r) => ({
    ...r,
    actorEmail: r.actorEmail ?? null,
    actorName: r.actorName ?? null,
    changes: r.changes as Record<string, unknown> | null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Count audit rows matching filters — used for 50k cap check.
 */
export async function countAuditLogs(
  db: Db,
  params: Omit<AuditListParams, 'page' | 'limit'>
): Promise<number> {
  const { entity, actor, action, from, to } = params;

  const conditions: ReturnType<typeof eq>[] = [];
  if (entity) conditions.push(eq(schema.auditLog.resourceType, entity));
  if (action) conditions.push(eq(schema.auditLog.action, action));
  if (actor) conditions.push(eq(schema.auditLog.staffId, actor));
  if (from) conditions.push(gte(schema.auditLog.createdAt, new Date(from)));
  if (to) conditions.push(lte(schema.auditLog.createdAt, new Date(to)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select({ value: count() }).from(schema.auditLog).where(where);
  return Number(rows[0]?.value ?? 0);
}
