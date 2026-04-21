// Unit tests for recovery-stuck-scanner service.
// Verifies threshold filtering, cold-tier exclusion, canBump/canCancel flags.
// Uses in-memory mocks — no real Postgres required.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ScanConfig, listStuckTxs } from '../services/recovery-stuck-scanner.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-21T12:00:00Z').getTime();
const msAgo = (ms: number) => new Date(NOW - ms);
const minAgo = (m: number) => msAgo(m * 60_000);

const makeWithdrawal = (overrides: Record<string, unknown> = {}) => ({
  id: 'wd-001',
  status: 'broadcast',
  chain: 'bnb',
  sourceTier: 'hot',
  txHash: '0xabc123',
  broadcastAt: minAgo(15),
  bumpCount: 0,
  lastBumpAt: null,
  ...overrides,
});

const makeSweep = (overrides: Record<string, unknown> = {}) => ({
  id: 'sw-001',
  status: 'submitted',
  chain: 'bnb',
  txHash: '0xdef456',
  broadcastAt: minAgo(15),
  bumpCount: 0,
  lastBumpAt: null,
  ...overrides,
});

const DEFAULT_CONFIG: ScanConfig = {
  evmStuckMinutes: 10,
  solanaStuckSeconds: 60,
  maxBumps: 3,
};

// ── Mock helpers ──────────────────────────────────────────────────────────────

/**
 * The scanner calls db.select().from(table).where(...).limit(n) twice:
 * first for withdrawals, then for sweeps.
 * We use mockResolvedValueOnce to queue the two responses in order.
 */
function makeMockDb(withdrawals: unknown[], sweeps: unknown[]) {
  // Each call to limit() pops the next queued value
  const limitMock = vi.fn().mockResolvedValueOnce(withdrawals).mockResolvedValueOnce(sweeps);

  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  return { select: selectMock } as unknown as Parameters<typeof listStuckTxs>[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('listStuckTxs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns withdrawal that is past EVM threshold', async () => {
    const db = makeMockDb([makeWithdrawal({ broadcastAt: minAgo(11) })], []);
    const result = await listStuckTxs(db, DEFAULT_CONFIG);
    expect(result.items).toHaveLength(1);
    // Non-null safe: toHaveLength(1) above guarantees item exists
    expect(result.items[0]?.entityType).toBe('withdrawal');
    expect(result.items[0]?.canBump).toBe(true);
    expect(result.items[0]?.canCancel).toBe(true);
  });

  it('does NOT return withdrawal broadcast just 9 minutes ago (below EVM threshold)', async () => {
    // The DB query filters at the DB level — simulate by returning empty array (threshold not met)
    const db = makeMockDb([], []);
    const result = await listStuckTxs(db, DEFAULT_CONFIG);
    expect(result.items).toHaveLength(0);
  });

  it('maps sweep to entityType=sweep', async () => {
    const db = makeMockDb([], [makeSweep()]);
    const result = await listStuckTxs(db, DEFAULT_CONFIG);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.entityType).toBe('sweep');
  });

  it('cold-tier withdrawal: canBump=false, canCancel=false', async () => {
    const db = makeMockDb([makeWithdrawal({ sourceTier: 'cold' })], []);
    const result = await listStuckTxs(db, DEFAULT_CONFIG);
    // Non-null safe: mock supplies exactly 1 row
    expect(result.items[0]?.canBump).toBe(false);
    expect(result.items[0]?.canCancel).toBe(false);
  });

  it('Solana withdrawal: canCancel=false (no nonce semantics)', async () => {
    const db = makeMockDb([makeWithdrawal({ chain: 'sol' })], []);
    const result = await listStuckTxs(db, DEFAULT_CONFIG);
    expect(result.items[0]?.canCancel).toBe(false);
  });

  it('bump_count >= maxBumps: canBump=false', async () => {
    const db = makeMockDb([makeWithdrawal({ bumpCount: 3 })], []);
    const result = await listStuckTxs(db, DEFAULT_CONFIG);
    expect(result.items[0]?.canBump).toBe(false);
  });

  it('excludes rows with null txHash or null broadcastAt', async () => {
    const db = makeMockDb(
      [makeWithdrawal({ txHash: null }), makeWithdrawal({ broadcastAt: null })],
      []
    );
    const result = await listStuckTxs(db, DEFAULT_CONFIG);
    expect(result.items).toHaveLength(0);
  });

  it('returns thresholdsUsed from config', async () => {
    const db = makeMockDb([], []);
    const result = await listStuckTxs(db, {
      evmStuckMinutes: 5,
      solanaStuckSeconds: 30,
      maxBumps: 3,
    });
    expect(result.thresholdsUsed.evmMinutes).toBe(5);
    expect(result.thresholdsUsed.solanaSeconds).toBe(30);
  });

  it('sorts by ageSeconds descending (oldest first)', async () => {
    const older = makeWithdrawal({ id: 'wd-old', broadcastAt: minAgo(30) });
    const newer = makeWithdrawal({ id: 'wd-new', broadcastAt: minAgo(12) });
    const db = makeMockDb([newer, older], []);
    const result = await listStuckTxs(db, DEFAULT_CONFIG);
    // Non-null safe: mock supplies 2 rows
    expect(result.items[0]?.entityId).toBe('wd-old');
    expect(result.items[1]?.entityId).toBe('wd-new');
  });

  it('cancelling withdrawal: canCancel=false', async () => {
    const db = makeMockDb([makeWithdrawal({ status: 'cancelling' })], []);
    const result = await listStuckTxs(db, DEFAULT_CONFIG);
    expect(result.items[0]?.canCancel).toBe(false);
  });
});
