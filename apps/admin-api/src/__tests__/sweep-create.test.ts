// Unit tests for sweep create service — happy path, kill-switch guard,
// no candidates error, active sweep skip, BullMQ enqueue, socket emit.
// Uses in-memory mocks — no real Postgres, BullMQ, or Socket.io required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NotFoundError,
  SWEEP_EXECUTE_QUEUE,
  createSweeps,
} from '../services/sweep-create.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';
const UA_ID = 'addr-uuid-0001';
const SWEEP_ID = 'sweep-uuid-0001';

const makeUserAddress = (overrides: Record<string, unknown> = {}) => ({
  id: UA_ID,
  userId: 'user-uuid-0001',
  chain: 'bnb' as const,
  address: '0xUserAddr001',
  derivationPath: "m/44'/60'/0'/0/1",
  ...overrides,
});

const makeDeposit = (overrides: Record<string, unknown> = {}) => ({
  amount: '500',
  token: 'USDT',
  ...overrides,
});

// ── Mock helpers ──────────────────────────────────────────────────────────────

function buildMockDb(opts: {
  userAddresses?: ReturnType<typeof makeUserAddress>[];
  activeSweeps?: { userAddressId: string }[];
  deposits?: ReturnType<typeof makeDeposit>[];
  hotWallet?: { address: string } | undefined;
}) {
  const userAddresses = opts.userAddresses ?? [makeUserAddress()];
  const activeSweeps = opts.activeSweeps ?? [];
  const deposits = opts.deposits ?? [makeDeposit()];

  let selectCallCount = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // Load candidate user_addresses
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(userAddresses),
          }),
        };
      }
      if (selectCallCount === 2) {
        // Active sweeps check
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(activeSweeps),
          }),
        };
      }
      if (selectCallCount === 3) {
        // Deposits for the address
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(deposits),
          }),
        };
      }
      // Fallback for wallets (hot safe lookup)
      return {
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      };
    }),
    query: {
      wallets: {
        findFirst: vi.fn().mockResolvedValue(opts.hotWallet ?? { address: '0xHotSafe001' }),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: SWEEP_ID }]),
      }),
    }),
  };
}

function makeMockQueue(jobId = 'job-001') {
  return { add: vi.fn().mockResolvedValue({ id: jobId }) };
}

function makeMockIo() {
  const emitFn = vi.fn();
  return { of: vi.fn().mockReturnValue({ emit: emitFn }), _emit: emitFn };
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

const mockGetKillSwitchState = vi.fn();
vi.mock('../services/kill-switch.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/kill-switch.service.js')>();
  return { ...actual, getState: (...args: unknown[]) => mockGetKillSwitchState(...args) };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createSweeps service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetKillSwitchState.mockResolvedValue({ enabled: false, reason: null });
  });

  it('happy path — creates sweep row, enqueues BullMQ job, emits socket event', async () => {
    const db = buildMockDb({});
    const queue = makeMockQueue('job-uuid-001');
    const io = makeMockIo();

    const result = await createSweeps(
      db as unknown as Parameters<typeof createSweeps>[0],
      [UA_ID],
      STAFF_ID,
      queue as unknown as Parameters<typeof createSweeps>[3],
      io as unknown as Parameters<typeof createSweeps>[4]
    );

    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({ sweepId: SWEEP_ID, userAddressId: UA_ID });
    expect(queue.add).toHaveBeenCalledWith(
      SWEEP_EXECUTE_QUEUE,
      expect.objectContaining({ sweepId: SWEEP_ID, fromAddr: '0xUserAddr001' }),
      expect.objectContaining({ jobId: `sweep_execute_${SWEEP_ID}` })
    );
    expect(io._emit).toHaveBeenCalledWith(
      'sweep.started',
      expect.objectContaining({ sweepId: SWEEP_ID })
    );
  });

  it('throws NotFoundError when no matching user_addresses found', async () => {
    const db = buildMockDb({ userAddresses: [] });
    const queue = makeMockQueue();
    const io = makeMockIo();

    await expect(
      createSweeps(
        db as unknown as Parameters<typeof createSweeps>[0],
        ['non-existent-id'],
        STAFF_ID,
        queue as unknown as Parameters<typeof createSweeps>[3],
        io as unknown as Parameters<typeof createSweeps>[4]
      )
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });

  it('throws KillSwitchEnabledError when kill-switch is on', async () => {
    mockGetKillSwitchState.mockResolvedValue({ enabled: true, reason: 'security incident' });
    const db = buildMockDb({});
    const queue = makeMockQueue();
    const io = makeMockIo();

    await expect(
      createSweeps(
        db as unknown as Parameters<typeof createSweeps>[0],
        [UA_ID],
        STAFF_ID,
        queue as unknown as Parameters<typeof createSweeps>[3],
        io as unknown as Parameters<typeof createSweeps>[4]
      )
    ).rejects.toMatchObject({ name: 'KillSwitchEnabledError', statusCode: 423 });
  });

  it('skips address that already has an active sweep', async () => {
    const db = buildMockDb({ activeSweeps: [{ userAddressId: UA_ID }] });
    const queue = makeMockQueue();
    const io = makeMockIo();

    const result = await createSweeps(
      db as unknown as Parameters<typeof createSweeps>[0],
      [UA_ID],
      STAFF_ID,
      queue as unknown as Parameters<typeof createSweeps>[3],
      io as unknown as Parameters<typeof createSweeps>[4]
    );

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({
      userAddressId: UA_ID,
      reason: 'active_sweep_exists',
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('skips address when credited deposits total zero', async () => {
    const db = buildMockDb({ deposits: [makeDeposit({ amount: '0' })] });
    const queue = makeMockQueue();
    const io = makeMockIo();

    const result = await createSweeps(
      db as unknown as Parameters<typeof createSweeps>[0],
      [UA_ID],
      STAFF_ID,
      queue as unknown as Parameters<typeof createSweeps>[3],
      io as unknown as Parameters<typeof createSweeps>[4]
    );

    // Zero-amount token entries are skipped inside the per-token loop
    expect(result.created).toHaveLength(0);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
