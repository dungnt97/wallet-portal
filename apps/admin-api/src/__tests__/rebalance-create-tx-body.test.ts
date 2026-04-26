import { describe, expect, it, vi } from 'vitest';
// Supplemental coverage for rebalance-create.service.ts lines 201-231:
// The back-reference tx.update + emitAudit inside the transaction callback,
// plus the post-commit socket emit.
// Uses a direct unit test without clearAllMocks() to avoid v8 isolation artifacts.

// All mocks declared at module top so they are hoisted and stable
vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/policy-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/policy-client.js')>();
  return { ...actual, checkPolicy: vi.fn().mockResolvedValue({ allow: true, reasons: [] }) };
});

vi.mock('../services/kill-switch.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/kill-switch.service.js')>();
  return { ...actual, getState: vi.fn().mockResolvedValue({ enabled: false, reason: null }) };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-tx-body-001';
const USER_ID = 'user-tx-body-001';
const WD_ID = 'wd-tx-body-001';
const OP_ID = 'op-tx-body-001';
const COLD_ADDR = '0xColdTxBodyAddr001';

const makeWithdrawalRow = () => ({
  id: WD_ID,
  userId: USER_ID,
  chain: 'bnb',
  token: 'USDT',
  amount: '1000',
  destinationAddr: COLD_ADDR,
  status: 'pending',
  sourceTier: 'hot',
  multisigOpId: null,
  timeLockExpiresAt: null,
  createdBy: STAFF_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeOpRow = () => ({
  id: OP_ID,
  withdrawalId: WD_ID,
  chain: 'bnb',
  operationType: 'hot_to_cold',
  multisigAddr: '0xSafe',
  requiredSigs: 2,
  collectedSigs: 0,
  expiresAt: new Date(Date.now() + 86_400_000),
  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date(),
});

function buildDb() {
  let insertN = 0;
  const txMock = {
    insert: vi.fn().mockImplementation(() => {
      insertN++;
      return {
        values: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue(insertN === 1 ? [makeWithdrawalRow()] : [makeOpRow()]),
        }),
      };
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  };

  return {
    query: {
      wallets: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'wallet-cold',
          chain: 'bnb',
          tier: 'cold',
          purpose: 'cold_reserve',
          address: COLD_ADDR,
        }),
      },
      users: {
        findFirst: vi.fn().mockResolvedValue({ id: USER_ID }),
      },
    },
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      insertN = 0;
      return cb(txMock);
    }),
    _txMock: txMock,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('createRebalance — transaction body lines 201-231', () => {
  it('calls tx.update (back-reference) and emitAudit inside transaction', async () => {
    process.env.SAFE_ADDRESS = '0xSafeBackRef000000000000000000000000001';
    process.env.SQUADS_MULTISIG_ADDRESS = 'SquadsBackRefPDA111111111111111111111111';

    const db = buildDb();
    const io = { of: vi.fn().mockReturnValue({ emit: vi.fn() }) };
    const { createRebalance } = await import('../services/rebalance-create.service.js');
    const { emitAudit } = await import('../services/audit.service.js');

    const result = await createRebalance(
      db as never,
      { chain: 'bnb', token: 'USDT', amountMinor: '1000', direction: 'hot_to_cold' },
      STAFF_ID,
      io as never,
      { baseUrl: 'http://localhost:3003', bearerToken: 'tk' }
    );

    // tx.update was called for the back-reference
    expect(db._txMock.update).toHaveBeenCalledTimes(1);
    // emitAudit was called inside the transaction
    expect(emitAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'rebalance.created' })
    );
    // Socket emit after commit (line 229)
    expect(io.of('/stream').emit).toHaveBeenCalledWith(
      'rebalance.created',
      expect.objectContaining({ direction: 'hot_to_cold', chain: 'bnb' })
    );
    expect(result.withdrawal.id).toBe(WD_ID);
  });

  it('emits rebalance.created with correct multisigOpId after back-reference update (line 208)', async () => {
    const db = buildDb();
    const io = { of: vi.fn().mockReturnValue({ emit: vi.fn() }) };
    const { createRebalance } = await import('../services/rebalance-create.service.js');

    const result = await createRebalance(
      db as never,
      { chain: 'bnb', token: 'USDC', amountMinor: '500', direction: 'hot_to_cold' },
      STAFF_ID,
      io as never,
      { baseUrl: 'http://localhost:3003', bearerToken: 'tk' }
    );

    // Line 208: withdrawal is spread with multisigOpId from newOp
    expect(result.withdrawal.multisigOpId).toBe(OP_ID);
    expect(result.multisigOp.id).toBe(OP_ID);
    expect(result.destinationAddr).toBe(COLD_ADDR);
  });
});
