// Tests for BullMQ queue factory + enqueue helpers.
// queue/deposit-confirm.ts, sweep-execute.ts, withdrawal-execute.ts,
// signer-ceremony-broadcast.ts — all 0-46% covered.
// Strategy: mock BullMQ Queue, call enqueue helpers, verify args.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock BullMQ ────────────────────────────────────────────────────────────────

const mockAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
const mockQueueInstance = { add: mockAdd, close: vi.fn() };
const MockQueue = vi.fn().mockImplementation(() => mockQueueInstance);

vi.mock('bullmq', () => ({
  Queue: MockQueue,
}));

// ── Tests: deposit-confirm queue ──────────────────────────────────────────────

describe('deposit-confirm queue — makeDepositConfirmQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates Queue with correct name', async () => {
    const { makeDepositConfirmQueue } = await import('../queue/deposit-confirm.js');
    makeDepositConfirmQueue({} as never);
    expect(MockQueue).toHaveBeenCalledWith(
      'deposit_confirm',
      expect.objectContaining({ connection: expect.anything() })
    );
  });

  it('creates Queue with exponential backoff config', async () => {
    const { makeDepositConfirmQueue } = await import('../queue/deposit-confirm.js');
    makeDepositConfirmQueue({} as never);
    const opts = MockQueue.mock.calls[0]![1] as {
      defaultJobOptions: { backoff: { type: string } };
    };
    expect(opts.defaultJobOptions.backoff.type).toBe('exponential');
  });
});

describe('deposit-confirm queue — enqueueDepositConfirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls queue.add with deposit_confirm name and job data', async () => {
    const { enqueueDepositConfirm } = await import('../queue/deposit-confirm.js');
    const data = {
      depositId: 'dep-1',
      chain: 'bnb' as const,
      txHash: '0xhash',
      detectedAtBlock: 100,
    };
    await enqueueDepositConfirm(mockQueueInstance as never, data);
    expect(mockAdd).toHaveBeenCalledWith(
      'deposit_confirm',
      data,
      expect.objectContaining({ jobId: 'deposit-0xhash' })
    );
  });

  it('uses txHash as jobId for idempotency', async () => {
    const { enqueueDepositConfirm } = await import('../queue/deposit-confirm.js');
    const data = {
      depositId: 'dep-2',
      chain: 'sol' as const,
      txHash: 'solTxHash123',
      detectedAtBlock: 200,
    };
    await enqueueDepositConfirm(mockQueueInstance as never, data);
    const callArgs = mockAdd.mock.calls[0]![2] as { jobId: string };
    expect(callArgs.jobId).toBe('deposit-solTxHash123');
  });
});

// ── Tests: sweep-execute queue ────────────────────────────────────────────────

describe('sweep-execute queue — makeSweepExecuteQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates Queue with sweep_execute name', async () => {
    const { makeSweepExecuteQueue } = await import('../queue/sweep-execute.js');
    makeSweepExecuteQueue({} as never);
    expect(MockQueue).toHaveBeenCalledWith('sweep_execute', expect.anything());
  });

  it('creates Queue with 3 attempts', async () => {
    const { makeSweepExecuteQueue } = await import('../queue/sweep-execute.js');
    makeSweepExecuteQueue({} as never);
    const opts = MockQueue.mock.calls[0]![1] as { defaultJobOptions: { attempts: number } };
    expect(opts.defaultJobOptions.attempts).toBe(3);
  });
});

describe('sweep-execute queue — enqueueSweepExecute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses sweepId in jobId for idempotency', async () => {
    const { enqueueSweepExecute } = await import('../queue/sweep-execute.js');
    const data = {
      sweepId: 'sweep-abc',
      userAddressId: 'addr-1',
      derivationIndex: 0,
      chain: 'bnb' as const,
      token: 'USDT' as const,
      amount: '100',
      fromAddr: '0xFrom',
      destinationHotSafe: '0xHot',
    };
    await enqueueSweepExecute(mockQueueInstance as never, data);
    const callArgs = mockAdd.mock.calls[0]![2] as { jobId: string };
    expect(callArgs.jobId).toBe('sweep_execute_sweep-abc');
  });
});

// ── Tests: withdrawal-execute queue ──────────────────────────────────────────

describe('withdrawal-execute queue — makeWithdrawalExecuteQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates Queue with withdrawal_execute name', async () => {
    const { makeWithdrawalExecuteQueue } = await import('../queue/withdrawal-execute.js');
    makeWithdrawalExecuteQueue({} as never);
    expect(MockQueue).toHaveBeenCalledWith('withdrawal_execute', expect.anything());
  });
});

describe('withdrawal-execute queue — enqueueWithdrawalExecute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses withdrawalId in jobId for idempotency', async () => {
    const { enqueueWithdrawalExecute } = await import('../queue/withdrawal-execute.js');
    const data = {
      withdrawalId: 'wd-xyz',
      multisigOpId: 'op-1',
      chain: 'bnb' as const,
      token: 'USDC' as const,
      amount: '50',
      destinationAddr: '0xDest',
      sourceTier: 'hot' as const,
    };
    await enqueueWithdrawalExecute(mockQueueInstance as never, data);
    const callArgs = mockAdd.mock.calls[0]![2] as { jobId: string };
    expect(callArgs.jobId).toBe('withdrawal_execute:wd-xyz');
  });
});

// ── Tests: signer-ceremony-broadcast queue ────────────────────────────────────

describe('signer-ceremony-broadcast queue — makeSignerCeremonyQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates Queue with signer_ceremony name', async () => {
    const { makeSignerCeremonyQueue } = await import('../queue/signer-ceremony-broadcast.js');
    makeSignerCeremonyQueue({} as never);
    expect(MockQueue).toHaveBeenCalledWith('signer_ceremony', expect.anything());
  });
});

describe('signer-ceremony-broadcast queue — enqueueSignerCeremony', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses ceremonyId:chain composite jobId for idempotency', async () => {
    const { enqueueSignerCeremony } = await import('../queue/signer-ceremony-broadcast.js');
    const data = { ceremonyId: 'cer-1', chain: 'sol' as const };
    await enqueueSignerCeremony(mockQueueInstance as never, data);
    const callArgs = mockAdd.mock.calls[0]![2] as { jobId: string };
    expect(callArgs.jobId).toBe('ceremony:cer-1:sol');
  });
});
