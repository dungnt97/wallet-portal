// Unit tests for recovery-cancel.service — Solana 410, cold guard, happy EVM path.
// Uses in-memory mocks — no real Postgres or wallet-engine required.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock audit service — avoids needing real auditLog insert chain in unit tests
vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));
import {
  AlreadyFinalError,
  ColdTierNotSupportedError,
  NotFoundError,
  RecoveryDisabledError,
} from '../services/recovery-bump.service.js';
import { SolanaCannotCancelError, cancelTx } from '../services/recovery-cancel.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';
const ENTITY_ID = 'wd-uuid-cancel-001';
const TX_HASH = `0x${'ab'.repeat(32)}`;
const CANCEL_TX_HASH = `0x${'cc'.repeat(32)}`;
const IDEMPOTENCY_KEY = 'cancel-idem-key-0001';

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

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockDb(
  overrides: {
    withdrawalRow?: unknown;
    idempotencyRow?: unknown;
  } = {}
) {
  const { withdrawalRow, idempotencyRow = null } = overrides;

  return {
    query: {
      withdrawals: {
        findFirst: vi.fn().mockResolvedValue(withdrawalRow ?? makeWithdrawalRow()),
      },
      recoveryActions: {
        findFirst: vi.fn().mockResolvedValue(idempotencyRow),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: 'cancel-action-001', newTxHash: CANCEL_TX_HASH }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  } as unknown as Parameters<typeof cancelTx>[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cancelTx', () => {
  // Re-created in beforeEach so vi.resetAllMocks() doesn't strip the Promise stub
  // Typed to match service signature so TS accepts it as the 3rd argument to cancelTx.
  let notifyFn: (opts: { title: string; body: string; actionId: string }) => Promise<void>;

  beforeEach(() => {
    vi.resetAllMocks();
    notifyFn = vi.fn().mockResolvedValue(undefined) as (opts: {
      title: string;
      body: string;
      actionId: string;
    }) => Promise<void>;
    process.env.RECOVERY_ENABLED = undefined;
    process.env.HOT_SAFE_ADDRESS_BNB = '0xHotSafe000000000000000000000000000000001';
    // Default fetch: wallet-engine cancel succeeds
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ txHash: CANCEL_TX_HASH }),
    });
  });

  afterEach(() => {
    process.env.HOT_SAFE_ADDRESS_BNB = undefined;
  });

  it('throws RecoveryDisabledError when RECOVERY_ENABLED=false', async () => {
    process.env.RECOVERY_ENABLED = 'false';
    const db = makeMockDb();
    await expect(
      cancelTx(
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

  it('throws SolanaCannotCancelError for Solana chain (410)', async () => {
    const db = makeMockDb({ withdrawalRow: makeWithdrawalRow({ chain: 'sol' }) });
    await expect(
      cancelTx(
        db,
        {
          entityType: 'withdrawal',
          entityId: ENTITY_ID,
          staffId: STAFF_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        notifyFn
      )
    ).rejects.toThrow(SolanaCannotCancelError);
  });

  it('SolanaCannotCancelError has remedy field', async () => {
    const db = makeMockDb({ withdrawalRow: makeWithdrawalRow({ chain: 'sol' }) });
    try {
      await cancelTx(
        db,
        {
          entityType: 'withdrawal',
          entityId: ENTITY_ID,
          staffId: STAFF_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        notifyFn
      );
    } catch (err) {
      expect(err).toBeInstanceOf(SolanaCannotCancelError);
      expect((err as SolanaCannotCancelError).remedy).toBeTruthy();
    }
  });

  it('throws ColdTierNotSupportedError for cold-tier EVM withdrawal (403)', async () => {
    const db = makeMockDb({ withdrawalRow: makeWithdrawalRow({ sourceTier: 'cold' }) });
    await expect(
      cancelTx(
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

  it('throws AlreadyFinalError for already-cancelled status (409)', async () => {
    const db = makeMockDb({ withdrawalRow: makeWithdrawalRow({ status: 'cancelled' }) });
    await expect(
      cancelTx(
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

  it('throws NotFoundError when nonce is missing', async () => {
    const db = makeMockDb({ withdrawalRow: makeWithdrawalRow({ nonce: null }) });
    await expect(
      cancelTx(
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

  it('throws error when HOT_SAFE_ADDRESS_BNB not configured (fail-closed)', async () => {
    process.env.HOT_SAFE_ADDRESS_BNB = undefined;
    const db = makeMockDb();
    await expect(
      cancelTx(
        db,
        {
          entityType: 'withdrawal',
          entityId: ENTITY_ID,
          staffId: STAFF_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        notifyFn
      )
    ).rejects.toThrow(/HOT_SAFE_ADDRESS_NOT_CONFIGURED/);
  });

  it('returns existing action on idempotency key replay', async () => {
    const existingAction = { id: 'existing-cancel-action', newTxHash: CANCEL_TX_HASH };
    const db = makeMockDb({ idempotencyRow: existingAction });
    const result = await cancelTx(
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
    expect(result.actionId).toBe('existing-cancel-action');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('happy path EVM: creates action row, updates entity to cancelling, returns cancelTxHash', async () => {
    const db = makeMockDb();
    const result = await cancelTx(
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
    expect(result.cancelTxHash).toBe(CANCEL_TX_HASH);
    expect(db.insert).toHaveBeenCalled();
    // update called: status → cancelling
    expect(db.update).toHaveBeenCalled();
  });
});
