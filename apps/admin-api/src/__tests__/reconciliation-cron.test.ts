// Unit tests for reconciliation worker — repeatable job registration + boot recovery.
// Tests: cron jobId registered, GC jobId registered, RECON_ENABLED=false skips both,
//        recoverStaleSnapshots marks running snapshots as failed.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  recoverStaleSnapshots,
  registerReconRepeatableJobs,
} from '../workers/reconciliation-snapshot.worker.js';

// ── Mock queue helper ─────────────────────────────────────────────────────────

function makeQueue() {
  return { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
}

// ── Tests — repeatable job registration ──────────────────────────────────────

describe('registerReconRepeatableJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/performance/noDelete: env cleanup in tests is idiomatic
    delete process.env.RECON_ENABLED;
  });

  it('registers recon-daily and recon-gc repeatable jobs', async () => {
    const queue = makeQueue();
    await registerReconRepeatableJobs(queue as never);

    // Two calls: recon-cron + recon-gc
    expect(queue.add).toHaveBeenCalledTimes(2);

    const calls = queue.add.mock.calls;

    // First call: daily cron
    // biome-ignore lint/style/noNonNullAssertion: test assertion — calls are verified by toHaveBeenCalledTimes(2) above
    const [dailyName, , dailyOpts] = calls[0]!;
    expect(dailyName).toBe('recon-cron');
    expect(dailyOpts.jobId).toBe('recon-daily');
    expect(dailyOpts.repeat.pattern).toBe('0 0 * * *');

    // Second call: weekly GC
    // biome-ignore lint/style/noNonNullAssertion: test assertion — calls are verified above
    const [gcName, , gcOpts] = calls[1]!;
    expect(gcName).toBe('recon-gc');
    expect(gcOpts.jobId).toBe('recon-gc');
    expect(gcOpts.repeat.pattern).toBe('0 3 * * 0');
  });

  it('skips registration when RECON_ENABLED=false', async () => {
    process.env.RECON_ENABLED = 'false';
    const queue = makeQueue();
    await registerReconRepeatableJobs(queue as never);
    expect(queue.add).not.toHaveBeenCalled();
  });
});

// ── Tests — boot recovery ─────────────────────────────────────────────────────

describe('recoverStaleSnapshots', () => {
  it('updates running snapshots older than 30min to failed', async () => {
    const updatedRows = [{ id: 'stale-snap-001' }];
    const db = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(updatedRows),
          }),
        }),
      }),
    };

    await recoverStaleSnapshots(db as never);

    expect(db.update).toHaveBeenCalledOnce();
    // biome-ignore lint/style/noNonNullAssertion: test assertion — update called once, verified above
    const setCall = db.update.mock.results[0]!.value.set.mock.calls[0]?.[0];
    expect(setCall.status).toBe('failed');
    expect(setCall.errorMessage).toMatch(/timeout/);
  });

  it('does not throw when no stale snapshots exist', async () => {
    const db = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    await expect(recoverStaleSnapshots(db as never)).resolves.toBeUndefined();
  });
});
