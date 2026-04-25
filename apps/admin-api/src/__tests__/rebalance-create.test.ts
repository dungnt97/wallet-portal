// Unit tests for rebalance create service — happy path, kill-switch guard,
// missing cold wallet, policy block, socket emit.
// Uses in-memory mocks — no real Postgres, Policy Engine, or Socket.io required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, createRebalance } from '../services/rebalance-create.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';
const USER_ID = 'user-uuid-0001';
const WD_ID = 'wd-uuid-0001';
const OP_ID = 'op-uuid-0001';
const COLD_ADDR = '0xColdWallet001';
const HOT_ADDR = '0xHotWallet001';

const VALID_INPUT = {
  chain: 'bnb' as const,
  token: 'USDT' as const,
  amountMinor: '5000',
  direction: 'hot_to_cold' as const,
};

const makeWallet = (tier: 'hot' | 'cold', address: string) => ({
  id: `wallet-${tier}`,
  chain: 'bnb',
  tier,
  purpose: tier === 'cold' ? 'cold_reserve' : 'operational',
  address,
});

const makeWithdrawalRow = (overrides: Record<string, unknown> = {}) => ({
  id: WD_ID,
  userId: USER_ID,
  chain: 'bnb',
  token: 'USDT',
  amount: '5000',
  destinationAddr: COLD_ADDR,
  status: 'pending',
  sourceTier: 'hot',
  multisigOpId: OP_ID,
  timeLockExpiresAt: null,
  createdBy: STAFF_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeOpRow = () => ({
  id: OP_ID,
  withdrawalId: WD_ID,
  chain: 'bnb',
  operationType: 'hot_to_cold',
  multisigAddr: '0xSafe001',
  requiredSigs: 2,
  collectedSigs: 0,
  expiresAt: new Date(Date.now() + 86_400_000),
  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ── Mock helpers ──────────────────────────────────────────────────────────────

function buildMockDb(opts: {
  coldWallet?: ReturnType<typeof makeWallet> | undefined;
  hotWallet?: ReturnType<typeof makeWallet> | undefined;
  user?: { id: string } | undefined;
}) {
  let insertCallCount = 0;
  const txMock = {
    insert: vi.fn().mockImplementation(() => {
      insertCallCount++;
      const rows = insertCallCount === 1 ? [makeWithdrawalRow()] : [makeOpRow()];
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(rows),
        }),
      };
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert2: undefined, // just for type alignment
  };

  return {
    query: {
      wallets: {
        findFirst: vi.fn().mockImplementation((args: unknown) => {
          // Resolve based on call order: first = cold, second = hot user fallback
          const cold = opts.coldWallet;
          const hot = opts.hotWallet;
          // Return cold for cold_reserve purpose lookup, hot for operational
          if (cold) return Promise.resolve(cold);
          return Promise.resolve(hot);
        }),
      },
      users: {
        findFirst: vi.fn().mockResolvedValue(opts.user ?? { id: USER_ID }),
      },
    },
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      insertCallCount = 0; // reset per transaction
      return cb(txMock);
    }),
  };
}

function makeMockIo() {
  const emitFn = vi.fn();
  return { of: vi.fn().mockReturnValue({ emit: emitFn }), _emit: emitFn };
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

const mockCheckPolicy = vi.fn();
vi.mock('../services/policy-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/policy-client.js')>();
  return { ...actual, checkPolicy: (...args: unknown[]) => mockCheckPolicy(...args) };
});

const mockGetKillSwitchState = vi.fn();
vi.mock('../services/kill-switch.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/kill-switch.service.js')>();
  return { ...actual, getState: (...args: unknown[]) => mockGetKillSwitchState(...args) };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createRebalance service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPolicy.mockResolvedValue({ allow: true, reasons: [] });
    mockGetKillSwitchState.mockResolvedValue({ enabled: false, reason: null });
    process.env.SAFE_ADDRESS = '0xSafeTestAddr0000000000000000000000001';
    process.env.SQUADS_MULTISIG_ADDRESS = 'SquadsTestPDA11111111111111111111111111111';
  });

  it('happy path — creates withdrawal + multisig op, emits socket event', async () => {
    const db = buildMockDb({ coldWallet: makeWallet('cold', COLD_ADDR) });
    const io = makeMockIo();

    const result = await createRebalance(
      db as unknown as Parameters<typeof createRebalance>[0],
      VALID_INPUT,
      STAFF_ID,
      io as unknown as Parameters<typeof createRebalance>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.withdrawal).toBeDefined();
    expect(result.multisigOp).toBeDefined();
    expect(result.destinationAddr).toBe(COLD_ADDR);
    expect(io._emit).toHaveBeenCalledWith(
      'rebalance.created',
      expect.objectContaining({ direction: 'hot_to_cold', chain: 'bnb' })
    );
  });

  it('throws KillSwitchEnabledError when kill-switch is on', async () => {
    mockGetKillSwitchState.mockResolvedValue({ enabled: true, reason: 'security incident' });
    const db = buildMockDb({ coldWallet: makeWallet('cold', COLD_ADDR) });
    const io = makeMockIo();

    await expect(
      createRebalance(
        db as unknown as Parameters<typeof createRebalance>[0],
        VALID_INPUT,
        STAFF_ID,
        io as unknown as Parameters<typeof createRebalance>[3],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({ name: 'KillSwitchEnabledError', statusCode: 423 });
  });

  it('throws NotFoundError when no cold_reserve wallet registered', async () => {
    const db = buildMockDb({ coldWallet: undefined });
    const io = makeMockIo();

    await expect(
      createRebalance(
        db as unknown as Parameters<typeof createRebalance>[0],
        VALID_INPUT,
        STAFF_ID,
        io as unknown as Parameters<typeof createRebalance>[3],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });

  it('throws PolicyRejectedError when policy engine blocks', async () => {
    mockCheckPolicy.mockResolvedValue({
      allow: false,
      reasons: [{ rule: 'blacklist', message: 'Address blocked' }],
    });
    const db = buildMockDb({ coldWallet: makeWallet('cold', COLD_ADDR) });
    const io = makeMockIo();

    await expect(
      createRebalance(
        db as unknown as Parameters<typeof createRebalance>[0],
        VALID_INPUT,
        STAFF_ID,
        io as unknown as Parameters<typeof createRebalance>[3],
        { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
      )
    ).rejects.toMatchObject({ name: 'PolicyRejectedError', statusCode: 403 });
  });

  it('cold_to_hot direction resolves hot operational wallet as destination', async () => {
    const db = buildMockDb({ hotWallet: makeWallet('hot', HOT_ADDR) });
    const io = makeMockIo();

    const result = await createRebalance(
      db as unknown as Parameters<typeof createRebalance>[0],
      { ...VALID_INPUT, direction: 'cold_to_hot' },
      STAFF_ID,
      io as unknown as Parameters<typeof createRebalance>[3],
      { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' }
    );

    expect(result.destinationAddr).toBe(HOT_ADDR);
  });
});
