// Unit tests for deposit CSV export service — CSV generation, empty list,
// date/amount formatting, special character escaping.
// Uses in-memory mocks — no real Postgres required.
import { describe, expect, it, vi } from 'vitest';
import {
  type DepositExportRow,
  countDepositsForExport,
  depositCsvHeader,
  streamDepositCsv,
} from '../services/deposit-csv.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeExportRow = (overrides: Partial<DepositExportRow> = {}): DepositExportRow => ({
  id: 'dep-uuid-0001',
  createdAt: '2026-04-01T00:00:00.000Z',
  chain: 'bnb',
  userEmail: 'user@example.com',
  token: 'USDT',
  amountMinor: '1000',
  txHash: '0xhash001',
  status: 'credited',
  blockNumber: 0,
  confirmations: 12,
  ...overrides,
});

// ── streamDepositCsv tests ────────────────────────────────────────────────────

describe('streamDepositCsv', () => {
  it('outputs header line as first chunk', () => {
    const chunks: string[] = [];
    streamDepositCsv([], (chunk) => chunks.push(chunk));
    expect(chunks[0]).toContain('id,created_at,chain');
  });

  it('produces correct CSV row for a deposit', () => {
    const row = makeExportRow();
    const chunks: string[] = [];
    streamDepositCsv([row], (chunk) => chunks.push(chunk));
    const csv = chunks.join('');
    expect(csv).toContain('dep-uuid-0001');
    expect(csv).toContain('user@example.com');
    expect(csv).toContain('0xhash001');
    expect(csv).toContain('2026-04-01T00:00:00.000Z');
    expect(csv).toContain('12'); // confirmations
  });

  it('empty list → header only, no data rows', () => {
    const chunks: string[] = [];
    streamDepositCsv([], (chunk) => chunks.push(chunk));
    const csv = chunks.join('');
    const lines = csv.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(depositCsvHeader());
  });

  it('escapes double-quote characters per RFC 4180', () => {
    const row = makeExportRow({ userEmail: 'user"test"@example.com' });
    const chunks: string[] = [];
    streamDepositCsv([row], (chunk) => chunks.push(chunk));
    const csv = chunks.join('');
    expect(csv).toContain('"user""test""@example.com"');
  });

  it('handles null txHash and userEmail gracefully', () => {
    const row = makeExportRow({ txHash: null, userEmail: null });
    const chunks: string[] = [];
    streamDepositCsv([row], (chunk) => chunks.push(chunk));
    const csv = chunks.join('');
    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
  });

  it('multiple rows produce correct line count', () => {
    const rows = [makeExportRow(), makeExportRow({ id: 'dep-uuid-0002' })];
    const chunks: string[] = [];
    streamDepositCsv(rows, (chunk) => chunks.push(chunk));
    const csv = chunks.join('');
    const lines = csv.split('\n').filter((l) => l.length > 0);
    // header + 2 data rows
    expect(lines).toHaveLength(3);
  });
});

// ── depositCsvHeader tests ────────────────────────────────────────────────────

describe('depositCsvHeader', () => {
  it('contains all expected column names', () => {
    const header = depositCsvHeader();
    const expectedCols = [
      'id',
      'created_at',
      'chain',
      'user_email',
      'token',
      'amount_minor',
      'tx_hash',
      'status',
      'block_number',
      'confirmations',
    ];
    for (const col of expectedCols) {
      expect(header).toContain(col);
    }
  });
});

// ── countDepositsForExport tests ──────────────────────────────────────────────

describe('countDepositsForExport', () => {
  it('returns 0 when no rows exist', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        }),
      }),
    };
    const count = await countDepositsForExport(
      db as unknown as Parameters<typeof countDepositsForExport>[0],
      {}
    );
    expect(count).toBe(0);
  });

  it('returns count from DB', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 17 }]),
        }),
      }),
    };
    const count = await countDepositsForExport(
      db as unknown as Parameters<typeof countDepositsForExport>[0],
      { chain: 'sol', status: 'credited' }
    );
    expect(count).toBe(17);
  });
});
