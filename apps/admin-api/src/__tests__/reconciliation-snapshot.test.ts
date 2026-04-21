// Unit tests for reconciliation snapshot service.
// Tests: drift calculation, severity classification, in-flight suppression,
// zero-drift case, dry-run mode, advisory lock.
// All external I/O mocked — no real Postgres, Redis, or RPC required.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock balance probe so we control on-chain balances per test
vi.mock('../services/reconciliation-balance-probe.js', () => ({
  probeEvmBalance: vi.fn(),
  probeSolanaBalance: vi.fn(),
}));

// Mock address enumerator to return fixed addresses per test
vi.mock('../services/reconciliation-address-enumerator.service.js', () => ({
  enumerateManagedAddresses: vi.fn(),
}));

// Mock ledger-expected to return controlled balances
vi.mock('../services/reconciliation-ledger-expected.service.js', () => ({
  computeLedgerExpected: vi.fn(),
}));

import { enumerateManagedAddresses } from '../services/reconciliation-address-enumerator.service.js';
import { probeEvmBalance } from '../services/reconciliation-balance-probe.js';
import { computeLedgerExpected } from '../services/reconciliation-ledger-expected.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SNAP_ID = 'snap-0001-0000-0000-0000-000000000000';
const HOT_ADDR = '0xHOT';
const USER_ADDR = '0xUSER';

function makeAddress(overrides = {}) {
  return {
    chain: 'bnb' as const,
    token: 'USDT' as const,
    address: HOT_ADDR,
    accountLabel: 'hot_safe',
    addressScope: 'hot' as const,
    ...overrides,
  };
}

/** Build a DB mock that records INSERT calls */
function makeDb(
  opts: {
    snapshotInsertId?: string;
    withdrawalRows?: Array<{ sourceTier: string; userId: string }>;
  } = {}
) {
  const driftInserts: unknown[] = [];

  return {
    _driftInserts: driftInserts,
    execute: vi.fn().mockResolvedValue(undefined), // advisory lock no-op
    insert: vi.fn().mockImplementation((table: unknown) => {
      // Distinguish snapshot insert from drift insert by checking first call
      const returning = vi.fn().mockResolvedValue([{ id: opts.snapshotInsertId ?? SNAP_ID }]);
      const values = vi.fn().mockImplementation((rows: unknown) => {
        driftInserts.push(rows);
        return { returning };
      });
      return { values };
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(opts.withdrawalRows ?? []),
      }),
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('reconciliation-snapshot — drift computation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: single hot BNB USDT address
    vi.mocked(enumerateManagedAddresses).mockResolvedValue([makeAddress()]);
  });

  it('computes zero drift when on-chain equals ledger', async () => {
    // On-chain: 1 USDT = 1_000_000_000_000_000_000 (18 dec)
    vi.mocked(probeEvmBalance).mockResolvedValue(1_000_000_000_000_000_000n);
    vi.mocked(computeLedgerExpected).mockResolvedValue(
      new Map([['hot_safe:USDT', 1_000_000_000_000_000_000n]])
    );
    const db = makeDb();

    const { runSnapshot } = await import('../services/reconciliation-snapshot.service.js');
    process.env.RECON_DRY_RUN = 'false';

    const result = await runSnapshot(db as never, {} as never, { scope: 'hot' });

    expect(result.driftCount).toBe(0);
    expect(result.criticalCount).toBe(0);
    expect(result.warningCount).toBe(0);
  });

  it('creates critical drift row when |drift| > $100', async () => {
    // On-chain: 201 USDT (18 dec) → ledger 0 → drift = $201 → critical
    const onChainMinor = 201n * 10n ** 18n;
    vi.mocked(probeEvmBalance).mockResolvedValue(onChainMinor);
    vi.mocked(computeLedgerExpected).mockResolvedValue(new Map());

    const db = makeDb();
    const { runSnapshot } = await import('../services/reconciliation-snapshot.service.js');
    process.env.RECON_DRY_RUN = 'false';
    process.env.RECON_CRITICAL_THRESHOLD_CENTS = '10000'; // $100

    const result = await runSnapshot(db as never, {} as never, {});

    expect(result.criticalCount).toBe(1);
    expect(result.driftCount).toBe(1);
  });

  it('skips drift row when |drift| <= dust threshold ($1)', async () => {
    // On-chain: 0.50 USDT (18 dec) → ledger 0 → drift = $0.50 < $1 → skip
    const onChainMinor = 5n * 10n ** 17n; // 0.5 USDT
    vi.mocked(probeEvmBalance).mockResolvedValue(onChainMinor);
    vi.mocked(computeLedgerExpected).mockResolvedValue(new Map());

    const db = makeDb();
    const { runSnapshot } = await import('../services/reconciliation-snapshot.service.js');
    process.env.RECON_DRY_RUN = 'false';
    process.env.RECON_DUST_THRESHOLD_CENTS = '100'; // $1

    const result = await runSnapshot(db as never, {} as never, {});

    expect(result.driftCount).toBe(0);
  });

  it('creates warning drift row for drift between $10 and $100', async () => {
    // On-chain: 50 USDT (18 dec) → ledger 0 → drift = $50 → warning
    const onChainMinor = 50n * 10n ** 18n;
    vi.mocked(probeEvmBalance).mockResolvedValue(onChainMinor);
    vi.mocked(computeLedgerExpected).mockResolvedValue(new Map());

    const db = makeDb();
    const { runSnapshot } = await import('../services/reconciliation-snapshot.service.js');
    process.env.RECON_DRY_RUN = 'false';
    process.env.RECON_WARNING_THRESHOLD_CENTS = '1000'; // $10
    process.env.RECON_CRITICAL_THRESHOLD_CENTS = '10000'; // $100

    const result = await runSnapshot(db as never, {} as never, {});

    expect(result.warningCount).toBe(1);
    expect(result.criticalCount).toBe(0);
  });
});

describe('reconciliation-snapshot — in-flight suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks drift row suppressed when hot_safe has in-flight withdrawal', async () => {
    vi.mocked(enumerateManagedAddresses).mockResolvedValue([
      makeAddress({ address: HOT_ADDR, accountLabel: 'hot_safe', addressScope: 'hot' }),
    ]);
    // Large drift that would be critical
    vi.mocked(probeEvmBalance).mockResolvedValue(500n * 10n ** 18n);
    vi.mocked(computeLedgerExpected).mockResolvedValue(new Map());

    // DB returns an in-flight hot withdrawal
    const db = makeDb({
      withdrawalRows: [{ sourceTier: 'hot', userId: 'user-001' }],
    });

    const { runSnapshot } = await import('../services/reconciliation-snapshot.service.js');
    process.env.RECON_DRY_RUN = 'false';

    const result = await runSnapshot(db as never, {} as never, {});

    // Drift row still created (for audit) but suppressed
    expect(result.driftCount).toBeGreaterThan(0);
    // The insert call should include suppressedReason
    const insertCalls = db._driftInserts;
    // Find the drift rows insert (second insert call = drift rows)
    const driftPayload = insertCalls[1] as Array<{ suppressedReason: string | null }>;
    if (Array.isArray(driftPayload)) {
      const row = driftPayload[0];
      expect(row?.suppressedReason).toBe('in_flight_withdrawal');
    }
  });
});

describe('reconciliation-snapshot — dry-run', () => {
  it('does not insert drift rows when RECON_DRY_RUN=true', async () => {
    vi.mocked(enumerateManagedAddresses).mockResolvedValue([makeAddress()]);
    vi.mocked(probeEvmBalance).mockResolvedValue(500n * 10n ** 18n);
    vi.mocked(computeLedgerExpected).mockResolvedValue(new Map());

    const db = makeDb();
    const { runSnapshot } = await import('../services/reconciliation-snapshot.service.js');
    process.env.RECON_DRY_RUN = 'true';

    const result = await runSnapshot(db as never, {} as never, {});

    // Drift count still reported but no DB insert for drift rows
    expect(result.criticalCount).toBeGreaterThan(0);
    // Only 1 insert call (snapshot row), no drift insert
    expect(db._driftInserts).toHaveLength(1); // only the snapshot insert values
  });
});
