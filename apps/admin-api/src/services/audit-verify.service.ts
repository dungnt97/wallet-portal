// Audit chain verification service — recomputes SHA-256 hash chain over a date range
// Hash formula matches DB trigger in migration 0001_audit_trigger.sql:
//   sha256(prev_hash || staff_id || action || changes)
// where changes is JSON-serialized, staff_id is '' when null
import { createHash } from 'node:crypto';
import { and, asc, gte, lte } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export interface VerifyChainParams {
  from: string;
  to: string;
}

export interface VerifyChainResult {
  verified: boolean;
  checked: number;
  brokenAt?: string;
}

/**
 * Recompute the SHA-256 hash for a single audit row.
 * Must exactly match the DB trigger formula:
 *   sha256(prev_hash || staff_id || action || changes)
 * - prev_hash: '' for first row
 * - staff_id: '' when null
 * - changes: JSON.stringify of the JSONB value, or '' when null
 */
function computeRowHash(params: {
  prevHash: string;
  staffId: string | null;
  action: string;
  changes: unknown;
}): string {
  const { prevHash, staffId, action, changes } = params;
  const changesStr = changes != null ? JSON.stringify(changes) : '';
  const staffIdStr = staffId ?? '';
  const input = prevHash + staffIdStr + action + changesStr;
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Verify the hash chain integrity for all rows in the given created_at range.
 * Rows are processed in ASC order (as they were inserted).
 * Returns verified=true + count if all hashes match, or verified=false + brokenAt id.
 *
 * @throws Error if from/to params are missing (caller should validate before calling)
 */
export async function verifyChain(db: Db, params: VerifyChainParams): Promise<VerifyChainResult> {
  const { from, to } = params;

  const rows = await db
    .select({
      id: schema.auditLog.id,
      staffId: schema.auditLog.staffId,
      action: schema.auditLog.action,
      changes: schema.auditLog.changes,
      prevHash: schema.auditLog.prevHash,
      hash: schema.auditLog.hash,
    })
    .from(schema.auditLog)
    .where(
      and(
        gte(schema.auditLog.createdAt, new Date(from)),
        lte(schema.auditLog.createdAt, new Date(to))
      )
    )
    .orderBy(asc(schema.auditLog.createdAt));

  if (rows.length === 0) {
    return { verified: true, checked: 0 };
  }

  let checked = 0;
  for (const row of rows) {
    const expected = computeRowHash({
      prevHash: row.prevHash ?? '',
      staffId: row.staffId,
      action: row.action,
      changes: row.changes,
    });

    if (expected !== row.hash) {
      return { verified: false, checked, brokenAt: row.id };
    }
    checked++;
  }

  return { verified: true, checked };
}
