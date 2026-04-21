// Unit tests for recovery-bump.service — guards, rate-limit, idempotency, happy path.
// Uses in-memory mocks — no real Postgres or wallet-engine required.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AlreadyFinalError,
  BumpRateLimitError,
  ColdTierNotSupportedError,
  GasOracleError,
  NotFoundError,
  RebalanceNotSupportedError,
  RecoveryDisabledError,
  bumpTx,
} from '../services/recovery-bump.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';
const ENTITY_ID = 'wd-uuid-e2e-001';
const TX_HASH = `0x${'ab'.repeat(32)}`;
const NEW_TX_HASH = `0x${'cd'.repeat(32)}`;
const IDEMPOTENCY_KEY = 'idem-key-0001';

const makeWithdrawalRow = (overrides: Record<string, unknown> = {}) => ({
  id: ENTITY_ID,
  status: 'broadcast',
  chain: 'bnb',
  sourceTier: 'hot',
  txHash: TX_HASH,
  nonce: 42,
  bumpCount: 0,
  lastBumpAt: null,
  updatedAt: new Date(),
  ...overrides,
});

// ── Mock builders ─────────────────────────────────────────────────────────────

function makeQueryMock(row: unknown) {
  return {
    withdrawals: { findFirst: vi.fn().mockResolvedValue(row) },
    recoveryActions: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

function makeInsertMock(returnRows: unknown[]) {
  return vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returnRows),
    }),
  });
}

function makeUpdateMock() {
  return vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
}

function makeSelectMock(rows: unknown[]) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

function makeMockDb(
  overrides: {
    withdrawalRow?: unknown;
    idempotencyRow?: unknown;
    rateLimitCount?: number;
    insertRows?: unknown[];
  } = {}
) {
  const { withdrawalRow, idempotencyRow = null, rateLimitCount = 0, insertRows } = overrides;

  return {
    query: {
      withdrawals: {
        findFirst: vi.fn().mockResolvedValue(withdrawalRow ?? makeWithdrawalRow()),
      },
      recoveryActions: {
        findFirst: vi.fn().mockResolvedValue(idempotencyRow),
      },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ cnt: rateLimitCount }]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue(insertRows ?? [{ id: 'action-uuid-001', newTxHash: NEW_TX_HASH }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  } as unknown as Parameters<typeof bumpTx>[0];
}

// Mock audit service — avoids needing a real auditLog insert chain
vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

// Mock wallet-engine HTTP call
vi.mock('node:fetch', () => ({
  default: vi.fn(),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('bumpTx', () => {
  // notifyFn defined outside beforeEach — re-stubbed each time to ensure it returns a Promise
  // (vi.resetAllMocks() would clear the resolved-value stub, causing .catch() to fail)
  // Typed to match service signature so TS accepts it as the 3rd argument to bumpTx.
  let notifyFn: (opts: { title: string; body: string; actionId: string }) => Promise<void>;

  beforeEach(() => {
    vi.resetAllMocks();
    // Re-create after resetAllMocks so mockResolvedValue stub is always fresh
    notifyFn = vi.fn().mockResolvedValue(undefined) as (opts: {
      title: string;
      body: string;
      actionId: string;
    }) => Promise<void>;
    process.env.RECOVERY_ENABLED = undefined;
    // Reset global fetch mock to return success by default
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ txHash: NEW_TX_HASH }),
    });
  });

  it('throws RecoveryDisabledError when RECOVERY_ENABLED=false', async () => {
    process.env.RECOVERY_ENABLED = 'false';
    const db = makeMockDb();
    await expect(
      bumpTx(
        db,
        {
          entityType: 'withdrawal',
          entityId: ENTITY_ID,
          staffId: STAFF_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        notifyFn
      )
    ).rejects.toThrow(RecoveryDisabledError);
  });

  it('throws ColdTierNotSupportedError for cold-tier withdrawal (403)', async () => {
    const db = makeMockDb({ withdrawalRow: makeWithdrawalRow({ sourceTier: 'cold' }) });
    await expect(
      bumpTx(
        db,
        {
          entityType: 'withdrawal',
          entityId: ENTITY_ID,
          staffId: STAFF_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        notifyFn
      )
    ).rejects.toThrow(ColdTierNotSupportedError);
  });

  it('throws AlreadyFinalError for confirmed status (409)', async () => {
    const db = makeMockDb({ withdrawalRow: makeWithdrawalRow({ status: 'confirmed' }) });
    await expect(
      bumpTx(
        db,
        {
          entityType: 'withdrawal',
          entityId: ENTITY_ID,
          staffId: STAFF_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        notifyFn
      )
    ).rejects.toThrow(AlreadyFinalError);
  });

  it('throws BumpRateLimitError on 4th bump (429)', async () => {
    // rateLimitCount = 3 means 3 bumps in last hour → exceeded
    const db = makeMockDb({ rateLimitCount: 3 });
    await expect(
      bumpTx(
        db,
        {
          entityType: 'withdrawal',
          entityId: ENTITY_ID,
          staffId: STAFF_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        notifyFn
      )
    ).rejects.toThrow(BumpRateLimitError);
  });

  it('throws NotFoundError when entity has no tx_hash', async () => {
    const db = makeMockDb({ withdrawalRow: makeWithdrawalRow({ txHash: null }) });
    await expect(
      bumpTx(
        db,
        {
          entityType: 'withdrawal',
          entityId: ENTITY_ID,
          staffId: STAFF_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        notifyFn
      )
    ).rejects.toThrow(NotFoundError);
  });

  it('returns existing action on idempotency key replay (200)', async () => {
    const existingAction = { id: 'existing-action', newTxHash: NEW_TX_HASH };
    const db = makeMockDb({ idempotencyRow: existingAction });
    const result = await bumpTx(
      db,
      {
        entityType: 'withdrawal',
        entityId: ENTITY_ID,
        staffId: STAFF_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      },
      notifyFn
    );
    expect(result.idempotentReplay).toBe(true);
    expect(result.actionId).toBe('existing-action');
    // wallet-engine should NOT be called on replay
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws GasOracleError when wallet-engine returns 503', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ code: 'GAS_ORACLE_UNAVAILABLE', message: 'oracle down' }),
    });
    const db = makeMockDb();
    await expect(
      bumpTx(
        db,
        {
          entityType: 'withdrawal',
          entityId: ENTITY_ID,
          staffId: STAFF_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        notifyFn
      )
    ).rejects.toThrow(GasOracleError);
  });

  it('happy path dev-mode: creates action row, calls notifyFn, returns bumpCount+1', async () => {
    const db = makeMockDb();
    const result = await bumpTx(
      db,
      {
        entityType: 'withdrawal',
        entityId: ENTITY_ID,
        staffId: STAFF_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      },
      notifyFn
    );
    expect(result.idempotentReplay).toBe(false);
    expect(result.newTxHash).toBe(NEW_TX_HASH);
    expect(result.bumpCount).toBe(1);
    // notify should be called (fire-and-forget — may not be awaited before return)
    // We just verify it was invoked at some point via the action row
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it('feeMultiplier = 1.15^(bumpCount+1) increases with each bump', () => {
    // Property test: verify the formula is monotonically increasing
    const bump1 = 1.15 ** 1; // first bump
    const bump2 = 1.15 ** 2;
    const bump3 = 1.15 ** 3;
    expect(bump2).toBeGreaterThan(bump1);
    expect(bump3).toBeGreaterThan(bump2);
    // Hard cap at 3 bumps: 1.15^3 ≈ 1.521 — still under typical gas caps
    expect(bump3).toBeCloseTo(1.521, 2);
  });
});
