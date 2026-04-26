// Targeted coverage for deposit-detector.ts uncovered paths:
// - persistAndEnqueue idempotency skip (line 149-151): existing row found
// - persistAndEnqueue insert-failed guard (line 166-168): db.insert returns empty
// - detectDeposit unified API (lines 118-128)
// - detectBnbDeposits getLogs error path (lines 81-84)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Schema + ORM mocks (hoisted) ──────────────────────────────────────────────

vi.mock('@wp/admin-api/db-schema', () => ({
  deposits: { id: 'id', txHash: 'txHash', status: 'status' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ eq: val })),
  inArray: vi.fn(),
}));

vi.mock('../queue/deposit-confirm.js', () => ({
  enqueueDepositConfirm: vi.fn().mockResolvedValue(undefined),
  QUEUE_NAME: 'deposit_confirm',
}));

vi.mock('ethers', () => ({
  id: vi.fn().mockReturnValue('0xTransferTopic'),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeQueue() {
  return { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
}

/** Build a drizzle-style chainable query mock that returns a given result for select */
function makeDb(opts: {
  existingRows?: { id: string }[];
  insertedRows?: { id: string }[];
  insertShouldFail?: boolean;
  selectShouldFail?: boolean;
}) {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(opts.existingRows ?? []),
  };

  if (opts.selectShouldFail) {
    selectChain.limit = vi.fn().mockRejectedValue(new Error('select failed'));
  }

  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: opts.insertShouldFail
      ? vi.fn().mockRejectedValue(new Error('insert failed'))
      : vi.fn().mockResolvedValue(opts.insertedRows ?? [{ id: 'dep-new-1' }]),
  };

  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    _selectChain: selectChain,
    _insertChain: insertChain,
  };
}

// ── Tests: detectDeposit (unified API) ────────────────────────────────────────

describe('deposit-detector — detectDeposit unified API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('detects and persists a new BNB deposit event', async () => {
    const { detectDeposit } = await import('../watcher/deposit-detector.js');
    const { enqueueDepositConfirm } = await import('../queue/deposit-confirm.js');

    const db = makeDb({ existingRows: [], insertedRows: [{ id: 'dep-1' }] });
    const queue = makeQueue();

    await detectDeposit(db as never, queue as never, {
      chain: 'bnb',
      txHash: '0xnewHash',
      logIndex: 0,
      blockNumber: 100,
      token: 'USDT',
      amount: BigInt(1_000_000),
      to: '0xRecipient',
      userId: 'user-1',
    });

    expect(vi.mocked(enqueueDepositConfirm)).toHaveBeenCalledOnce();
    expect(vi.mocked(enqueueDepositConfirm)).toHaveBeenCalledWith(
      queue,
      expect.objectContaining({ depositId: 'dep-1', chain: 'bnb', txHash: '0xnewHash' })
    );
  });

  it('detects and persists a new Solana deposit event', async () => {
    const { detectDeposit } = await import('../watcher/deposit-detector.js');
    const { enqueueDepositConfirm } = await import('../queue/deposit-confirm.js');

    const db = makeDb({ existingRows: [], insertedRows: [{ id: 'dep-sol-1' }] });
    const queue = makeQueue();

    await detectDeposit(db as never, queue as never, {
      chain: 'sol',
      txHash: 'solTxSig111',
      logIndex: 0,
      blockNumber: 500,
      token: 'USDC',
      amount: BigInt(5_000_000),
      to: 'SolAddr111',
      userId: 'user-2',
    });

    expect(vi.mocked(enqueueDepositConfirm)).toHaveBeenCalledOnce();
    expect(vi.mocked(enqueueDepositConfirm)).toHaveBeenCalledWith(
      queue,
      expect.objectContaining({ depositId: 'dep-sol-1', chain: 'sol' })
    );
  });
});

// ── Tests: idempotency skip path ──────────────────────────────────────────────

describe('deposit-detector — idempotency skip (deposit already recorded)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips enqueue when deposit row already exists for txHash', async () => {
    const { detectDeposit } = await import('../watcher/deposit-detector.js');
    const { enqueueDepositConfirm } = await import('../queue/deposit-confirm.js');

    // existing row found → skip
    const db = makeDb({ existingRows: [{ id: 'dep-existing' }] });
    const queue = makeQueue();

    await detectDeposit(db as never, queue as never, {
      chain: 'bnb',
      txHash: '0xalreadyRecorded',
      logIndex: 0,
      blockNumber: 100,
      token: 'USDT',
      amount: BigInt(1_000_000),
      to: '0xRecipient',
      userId: 'user-1',
    });

    expect(vi.mocked(enqueueDepositConfirm)).not.toHaveBeenCalled();
  });
});

// ── Tests: insert-failed guard path ──────────────────────────────────────────

describe('deposit-detector — insert returns empty (failed insert guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips enqueue when db.insert returns empty array (concurrent insert race)', async () => {
    const { detectDeposit } = await import('../watcher/deposit-detector.js');
    const { enqueueDepositConfirm } = await import('../queue/deposit-confirm.js');

    // No existing row, but insert returns [] (race condition / unique constraint)
    const db = makeDb({ existingRows: [], insertedRows: [] });
    const queue = makeQueue();

    await detectDeposit(db as never, queue as never, {
      chain: 'bnb',
      txHash: '0xRaceHash',
      logIndex: 0,
      blockNumber: 200,
      token: 'USDC',
      amount: BigInt(2_000_000),
      to: '0xRecipient2',
      userId: 'user-3',
    });

    expect(vi.mocked(enqueueDepositConfirm)).not.toHaveBeenCalled();
  });
});

// ── Tests: detectBnbDeposits getLogs error ────────────────────────────────────

describe('deposit-detector — detectBnbDeposits getLogs error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('swallows getLogs error and returns without enqueuing', async () => {
    const { detectBnbDeposits } = await import('../watcher/deposit-detector.js');
    const { enqueueDepositConfirm } = await import('../queue/deposit-confirm.js');

    const failingProvider = {
      getLogs: vi.fn().mockRejectedValue(new Error('getLogs RPC error')),
    };
    const db = makeDb({});
    const queue = makeQueue();
    const watched = new Map([['0xrecipient', 'user-1']]);

    // Should not throw
    await expect(
      detectBnbDeposits(
        failingProvider as never,
        db as never,
        queue as never,
        100,
        200,
        watched,
        '0xUSDT',
        '0xUSDC'
      )
    ).resolves.toBeUndefined();

    expect(vi.mocked(enqueueDepositConfirm)).not.toHaveBeenCalled();
  });

  it('skips when watchedAddresses map is empty', async () => {
    const { detectBnbDeposits } = await import('../watcher/deposit-detector.js');
    const { enqueueDepositConfirm } = await import('../queue/deposit-confirm.js');

    const provider = { getLogs: vi.fn() };
    const db = makeDb({});
    const queue = makeQueue();

    await detectBnbDeposits(
      provider as never,
      db as never,
      queue as never,
      100,
      200,
      new Map(), // empty
      '0xUSDT',
      '0xUSDC'
    );

    // getLogs not called when no watched addresses
    expect(provider.getLogs).not.toHaveBeenCalled();
    expect(vi.mocked(enqueueDepositConfirm)).not.toHaveBeenCalled();
  });
});
