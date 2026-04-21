// Unit tests for audit-verify.service — hash chain verification.
// Uses in-memory mocks — no real Postgres required.
// Covers: good chain, tampered row, empty range.
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyChain } from '../services/audit-verify.service.js';

// ── Hash helper (mirrors service + DB trigger formula) ────────────────────────

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

// ── Fixture builder ───────────────────────────────────────────────────────────

interface FixtureRow {
  id: string;
  staffId: string | null;
  action: string;
  changes: Record<string, unknown> | null;
  prevHash: string | null;
  hash: string;
}

function buildChain(n: number): FixtureRow[] {
  const rows: FixtureRow[] = [];
  let prevHash = '';
  for (let i = 0; i < n; i++) {
    const staffId = i % 3 === 0 ? null : `staff-${i}`;
    const action = `test.action.${i}`;
    const changes = { index: i, value: `v${i}` };
    // Each row's prevHash = previous row's hash (genesis row has null)
    const rowPrevHash = i === 0 ? null : prevHash;
    const hash = computeHash(prevHash, staffId, action, changes);
    rows.push({ id: `row-${i}`, staffId, action, changes, prevHash: rowPrevHash, hash });
    prevHash = hash;
  }
  return rows;
}

// ── Mock DB builder ───────────────────────────────────────────────────────────

function makeMockDb(rows: FixtureRow[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(
            rows.map((r) => ({
              ...r,
              createdAt: new Date(`2026-01-01T00:00:${String(rows.indexOf(r)).padStart(2, '0')}Z`),
            }))
          ),
        }),
      }),
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('verifyChain', () => {
  it('returns verified=true and correct count for a valid 10-row chain', async () => {
    const rows = buildChain(10);
    const db = makeMockDb(rows);
    const result = await verifyChain(db as never, {
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-01T01:00:00Z',
    });

    expect(result.verified).toBe(true);
    expect(result.checked).toBe(10);
    expect(result.brokenAt).toBeUndefined();
  });

  it('returns verified=false and brokenAt when row 5 is tampered', async () => {
    const rows = buildChain(10);

    // Tamper row index 5 — change payload, hash is now stale
    const tampered = rows[5] as FixtureRow;
    tampered.changes = { tampered: true, injected: 'evil' };
    // hash stays the original (as if updated directly bypassing trigger)

    const db = makeMockDb(rows);
    const result = await verifyChain(db as never, {
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-01T01:00:00Z',
    });

    expect(result.verified).toBe(false);
    expect(result.brokenAt).toBe('row-5');
    expect(result.checked).toBe(5); // checked 0..4, broke at 5
  });

  it('returns verified=true with checked=0 for empty range', async () => {
    const db = makeMockDb([]);
    const result = await verifyChain(db as never, {
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-01T01:00:00Z',
    });

    expect(result.verified).toBe(true);
    expect(result.checked).toBe(0);
    expect(result.brokenAt).toBeUndefined();
  });

  it('detects tamper at first row (row 0)', async () => {
    const rows = buildChain(5);

    // Tamper row 0 payload
    (rows[0] as FixtureRow).changes = { hacked: true };

    const db = makeMockDb(rows);
    const result = await verifyChain(db as never, {
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-01T01:00:00Z',
    });

    expect(result.verified).toBe(false);
    expect(result.brokenAt).toBe('row-0');
    expect(result.checked).toBe(0);
  });
});
