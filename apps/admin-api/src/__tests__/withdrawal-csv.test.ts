// Unit tests for withdrawal CSV export service — CSV generation, empty list,
// special character escaping.
// Uses in-memory mocks — no real Postgres required.
import { describe, expect, it, vi } from 'vitest';
import {
  type WithdrawalExportRow,
  countWithdrawalsForExport,
  queryWithdrawalsForExport,
  streamWithdrawalCsv,
  withdrawalCsvHeader,
} from '../services/withdrawal-csv.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeExportRow = (overrides: Partial<WithdrawalExportRow> = {}): WithdrawalExportRow => ({
  id: 'wd-uuid-0001',
  createdAt: '2026-04-01T00:00:00.000Z',
  chain: 'bnb',
  tier: 'hot',
  destination: '0xDest0001',
  token: 'USDT',
  amountMinor: '1000',
  status: 'completed',
  txHash: '0xhash001',
  initiatedByEmail: 'staff@example.com',
  approvedCount: 2,
  broadcastAt: '2026-04-01T01:00:00.000Z',
  confirmedAt: null,
  ...overrides,
});

// ── Mock helpers ──────────────────────────────────────────────────────────────

function buildMockDb(opts: {
  countResult?: number;
  rows?: Record<string, unknown>[];
  opRows?: Record<string, unknown>[];
}) {
  const selectChain = vi.fn();

  // select().from().where() → count result
  const countChain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ value: opts.countResult ?? 0 }]),
    }),
  };

  // select().from().leftJoin().where().orderBy() → rows
  const rowChain = {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(opts.rows ?? []),
        }),
      }),
    }),
  };

  // second select for ops (inArray)
  const opChain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(opts.opRows ?? []),
    }),
  };

  let callCount = 0;
  selectChain.mockImplementation(() => {
    callCount++;
    if (callCount === 1 && opts.countResult !== undefined) return countChain;
    if (callCount === 1) return rowChain;
    if (callCount === 2) return opChain;
    return rowChain;
  });

  return { select: selectChain };
}

// ── streamWithdrawalCsv tests ─────────────────────────────────────────────────

describe('streamWithdrawalCsv', () => {
  it('outputs header line as first chunk', () => {
    const chunks: string[] = [];
    streamWithdrawalCsv([], (chunk) => chunks.push(chunk));
    expect(chunks[0]).toContain('id,created_at,chain');
  });

  it('produces correct CSV row for a withdrawal', () => {
    const row = makeExportRow();
    const chunks: string[] = [];
    streamWithdrawalCsv([row], (chunk) => chunks.push(chunk));
    const csv = chunks.join('');
    expect(csv).toContain('wd-uuid-0001');
    expect(csv).toContain('0xDest0001');
    expect(csv).toContain('staff@example.com');
    expect(csv).toContain('2026-04-01T00:00:00.000Z');
  });

  it('empty list → header only, no data rows', () => {
    const chunks: string[] = [];
    streamWithdrawalCsv([], (chunk) => chunks.push(chunk));
    const csv = chunks.join('');
    const lines = csv.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(withdrawalCsvHeader());
  });

  it('escapes double-quote characters per RFC 4180', () => {
    const row = makeExportRow({ destination: '0xAddr"Evil"' });
    const chunks: string[] = [];
    streamWithdrawalCsv([row], (chunk) => chunks.push(chunk));
    const csv = chunks.join('');
    expect(csv).toContain('"0xAddr""Evil"""');
  });

  it('handles null txHash and confirmedAt gracefully', () => {
    const row = makeExportRow({ txHash: null, confirmedAt: null, broadcastAt: null });
    const chunks: string[] = [];
    streamWithdrawalCsv([row], (chunk) => chunks.push(chunk));
    const csv = chunks.join('');
    // Nulls become empty fields — no undefined/null string literal
    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
  });
});

// ── withdrawalCsvHeader tests ─────────────────────────────────────────────────

describe('withdrawalCsvHeader', () => {
  it('contains all expected column names', () => {
    const header = withdrawalCsvHeader();
    const expectedCols = [
      'id',
      'created_at',
      'chain',
      'tier',
      'destination',
      'token',
      'amount_minor',
      'status',
      'tx_hash',
      'initiated_by_email',
      'approved_count',
      'broadcast_at',
      'confirmed_at',
    ];
    for (const col of expectedCols) {
      expect(header).toContain(col);
    }
  });
});

// ── countWithdrawalsForExport tests ──────────────────────────────────────────

describe('countWithdrawalsForExport', () => {
  it('returns 0 when no rows exist', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        }),
      }),
    };
    const count = await countWithdrawalsForExport(
      db as unknown as Parameters<typeof countWithdrawalsForExport>[0],
      {}
    );
    expect(count).toBe(0);
  });

  it('returns count from DB', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 42 }]),
        }),
      }),
    };
    const count = await countWithdrawalsForExport(
      db as unknown as Parameters<typeof countWithdrawalsForExport>[0],
      { chain: 'bnb' }
    );
    expect(count).toBe(42);
  });
});
