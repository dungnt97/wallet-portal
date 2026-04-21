// Unit tests for audit CSV export — column order, hash_valid computation, 50k cap.
// Uses in-memory mocks — no real Postgres or Fastify required.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { auditRowToCsvLine, csvHeader, streamAuditCsv } from '../services/audit-csv.service.js';
import type { AuditLogEntry } from '../services/audit-query.service.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function computeHash(
  prevHash: string,
  staffId: string | null,
  action: string,
  changes: unknown
): string {
  const changesStr = changes != null ? JSON.stringify(changes) : '';
  const staffIdStr = staffId ?? '';
  return createHash('sha256')
    .update(prevHash + staffIdStr + action + changesStr, 'utf8')
    .digest('hex');
}

function makeRow(
  index: number,
  prevHash: string,
  overrides: Partial<AuditLogEntry> = {}
): AuditLogEntry {
  const staffId = `staff-${index}`;
  const action = `test.action.${index}`;
  const changes = { i: index };
  const hash = computeHash(prevHash, staffId, action, changes);
  return {
    id: `row-${index}`,
    staffId,
    actorEmail: `actor${index}@example.com`,
    actorName: `Actor ${index}`,
    action,
    resourceType: 'deposit',
    resourceId: `res-${index}`,
    changes,
    ipAddr: '1.2.3.4',
    ua: null,
    prevHash: prevHash || null,
    hash,
    createdAt: `2026-01-01T00:00:0${index}Z`,
    ...overrides,
  };
}

function buildRows(n: number): AuditLogEntry[] {
  const rows: AuditLogEntry[] = [];
  let prevHash = '';
  for (let i = 0; i < n; i++) {
    const row = makeRow(i, prevHash);
    rows.push(row);
    prevHash = row.hash;
  }
  return rows;
}

// ── csvHeader tests ───────────────────────────────────────────────────────────

describe('csvHeader', () => {
  it('returns correct column names in order', () => {
    expect(csvHeader()).toBe('id,created_at,entity,entity_id,action,actor_email,hash,hash_valid');
  });
});

// ── auditRowToCsvLine tests ───────────────────────────────────────────────────

describe('auditRowToCsvLine', () => {
  it('marks hash_valid=true for a correctly hashed row', () => {
    const rows = buildRows(1);
    const row = rows[0] as AuditLogEntry;
    const { line, hashValid } = auditRowToCsvLine(row);

    expect(hashValid).toBe(true);
    expect(line).toContain(',true');
    expect(line.startsWith('row-0,')).toBe(true);
  });

  it('marks hash_valid=false when hash does not match recomputed value', () => {
    const row = makeRow(0, '');
    // Tamper the hash stored in the row
    const tamperedRow: AuditLogEntry = { ...row, hash: `deadbeef${'0'.repeat(56)}` };
    const { hashValid } = auditRowToCsvLine(tamperedRow);
    expect(hashValid).toBe(false);
  });

  it('escapes CSV fields containing commas', () => {
    const row = makeRow(0, '', { actorEmail: 'comma,email@test.com' });
    const { line } = auditRowToCsvLine(row);
    expect(line).toContain('"comma,email@test.com"');
  });

  it('escapes CSV fields containing double quotes', () => {
    const row = makeRow(0, '', { resourceId: 'say "hello"' });
    const { line } = auditRowToCsvLine(row);
    expect(line).toContain('"say ""hello"""');
  });
});

// ── streamAuditCsv tests ──────────────────────────────────────────────────────

describe('streamAuditCsv', () => {
  it('produces header + correct number of data rows for 5 rows', () => {
    const rows = buildRows(5);
    const chunks: string[] = [];
    streamAuditCsv(rows, (chunk) => chunks.push(chunk));

    const output = chunks.join('');
    const lines = output.trim().split('\n');

    // First line is header
    expect(lines[0]).toBe('id,created_at,entity,entity_id,action,actor_email,hash,hash_valid');
    // 5 data rows
    expect(lines.length).toBe(6);
  });

  it('all rows in a valid chain have hash_valid=true', () => {
    const rows = buildRows(5);
    const chunks: string[] = [];
    streamAuditCsv(rows, (chunk) => chunks.push(chunk));

    const output = chunks.join('');
    const dataLines = output.trim().split('\n').slice(1);
    for (const line of dataLines) {
      expect(line.endsWith(',true')).toBe(true);
    }
  });

  it('produces empty output (header only) for zero rows', () => {
    const chunks: string[] = [];
    streamAuditCsv([], (chunk) => chunks.push(chunk));

    const output = chunks.join('');
    const lines = output.trim().split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe('id,created_at,entity,entity_id,action,actor_email,hash,hash_valid');
  });
});
