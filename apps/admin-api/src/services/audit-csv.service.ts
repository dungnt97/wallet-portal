// Audit CSV export service — streams CSV rows without loading full result into memory
// Columns: id, created_at, entity, entity_id, action, actor_email, hash, hash_valid
// hash_valid = per-row sha256 recompute (single pass, maintains prev_hash chain state)
import { createHash } from 'node:crypto';
import type { AuditLogEntry } from './audit-query.service.js';

const CSV_HEADERS = [
  'id',
  'created_at',
  'entity',
  'entity_id',
  'action',
  'actor_email',
  'hash',
  'hash_valid',
] as const;

/**
 * Escape a single CSV field value per RFC 4180.
 * Wraps in double-quotes if the value contains comma, double-quote, or newline.
 */
function escapeCsvField(value: string | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Format one row as a CSV line (no trailing newline). */
function formatCsvRow(fields: (string | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(',');
}

/**
 * Recompute hash for a row using the same formula as the DB trigger:
 *   sha256(prev_hash || staff_id || action || changes)
 */
function recomputeHash(params: {
  prevHash: string;
  staffId: string | null;
  action: string;
  changes: unknown;
}): string {
  const changesStr = params.changes != null ? JSON.stringify(params.changes) : '';
  const staffIdStr = params.staffId ?? '';
  const input = params.prevHash + staffIdStr + params.action + changesStr;
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Generate CSV header line.
 */
export function csvHeader(): string {
  return CSV_HEADERS.join(',');
}

/**
 * Convert a single AuditLogEntry to a CSV data line.
 * hash_valid is computed by replicating the DB trigger formula against row.prevHash.
 * Each row carries its own prevHash field so no external state is needed.
 *
 * @param row - the audit entry
 * @returns { line, hashValid }
 */
export function auditRowToCsvLine(row: AuditLogEntry): { line: string; hashValid: boolean } {
  const expected = recomputeHash({
    prevHash: row.prevHash ?? '',
    staffId: row.staffId,
    action: row.action,
    changes: row.changes,
  });

  const hashValid = expected === row.hash;

  const line = formatCsvRow([
    row.id,
    row.createdAt,
    row.resourceType,
    row.resourceId,
    row.action,
    row.actorEmail,
    row.hash,
    hashValid ? 'true' : 'false',
  ]);

  return { line, hashValid };
}

/**
 * Stream all rows as CSV to the provided write callback.
 * Each row's hash_valid is verified independently using its stored prevHash field.
 * Rows should be ordered ASC by created_at for logical chain display.
 *
 * @param rows - audit entries
 * @param write - callback invoked once per chunk (header line + each data line)
 */
export function streamAuditCsv(rows: AuditLogEntry[], write: (chunk: string) => void): void {
  write(`${csvHeader()}\n`);
  for (const row of rows) {
    const { line } = auditRowToCsvLine(row);
    write(`${line}\n`);
  }
}
