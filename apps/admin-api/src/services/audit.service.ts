// Audit service — appends an immutable audit_log row inside a transaction
// DB trigger computes hash chain at insert time (prev_hash → hash via pgcrypto SHA-256)
// staffId null = system-initiated event (e.g. block watcher crediting a deposit)
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export interface EmitAuditParams {
  /** null for system-initiated events (deposit credit from wallet-engine) */
  staffId: string | null;
  /** Verb, e.g. 'deposit.credit', 'withdrawal.approve' */
  action: string;
  /** Resource category, e.g. 'deposit', 'withdrawal' */
  resourceType: string;
  /** ID of the affected resource */
  resourceId: string;
  /** Before/after state diff — no raw PII */
  changes: Record<string, unknown>;
  /** Source IP (optional — available on web requests, absent for service calls) */
  ipAddr?: string;
}

/**
 * Insert one audit_log row inside an existing drizzle transaction.
 * The DB trigger fills prev_hash + hash automatically on insert.
 */
export async function emitAudit(tx: Db, params: EmitAuditParams): Promise<void> {
  await tx.insert(schema.auditLog).values({
    staffId: params.staffId ?? undefined,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    changes: params.changes,
    ipAddr: params.ipAddr ?? null,
    // hash will be set by DB trigger; insert placeholder so NOT NULL is satisfied
    hash: '',
  });
}
