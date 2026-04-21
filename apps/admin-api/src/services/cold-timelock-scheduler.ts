// Cold timelock scheduler — reconciliation + periodic fallback for cold-timelock-broadcast jobs.
//
// Two jobs:
//  1. On-boot scan: finds withdrawals WHERE status='time_locked' AND time_lock_expires_at <= now()
//     that may have been missed during Redis restart; enqueues broadcast jobs immediately.
//  2. 5-minute repeatable job (BullMQ repeatable): re-scans for newly unlocked rows that
//     missed their delayed job (e.g. Redis eviction, pod restart between create and fire).
//
// The actual broadcast logic lives in wallet-engine cold-timelock-broadcast worker.
import type { Queue } from 'bullmq';
import { and, eq, lte } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { COLD_TIMELOCK_QUEUE, type ColdTimelockJobData } from './withdrawal-create.service.js';

/* eslint-disable no-console */
const logger = {
  info: (obj: Record<string, unknown>, msg: string) =>
    console.info('[cold-timelock-scheduler]', msg, obj),
  error: (obj: Record<string, unknown>, msg: string) =>
    console.error('[cold-timelock-scheduler]', msg, obj),
  warn: (obj: Record<string, unknown>, msg: string) =>
    console.warn('[cold-timelock-scheduler]', msg, obj),
};

// ── Reconciliation helper ─────────────────────────────────────────────────────

/**
 * Scan for time_locked withdrawals whose unlock time has passed and enqueue broadcast jobs.
 * Safe to call repeatedly — BullMQ deduplicates by jobId (= withdrawalId).
 */
export async function reconcileExpiredTimelocks(
  db: Db,
  queue: Queue<ColdTimelockJobData>
): Promise<number> {
  const now = new Date();

  const expired = await db
    .select({ id: schema.withdrawals.id })
    .from(schema.withdrawals)
    .where(
      and(
        eq(schema.withdrawals.status, 'time_locked'),
        lte(schema.withdrawals.timeLockExpiresAt, now)
      )
    );

  if (expired.length === 0) return 0;

  let enqueued = 0;
  for (const row of expired) {
    try {
      await queue.add(
        COLD_TIMELOCK_QUEUE,
        { withdrawalId: row.id },
        {
          jobId: row.id, // idempotent — skips if job already exists
          delay: 0, // fire immediately (already past unlock time)
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 1000 },
        }
      );
      enqueued++;
    } catch (err) {
      logger.error({ err, withdrawalId: row.id }, 'Failed to enqueue expired timelock job');
    }
  }

  logger.info({ enqueued, total: expired.length }, 'Reconciled expired cold timelocks');
  return enqueued;
}

// ── Periodic fallback scheduler ───────────────────────────────────────────────

const FALLBACK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start the cold timelock scheduler:
 *  - Runs an immediate reconciliation on boot (handles Redis restart survivability).
 *  - Schedules a repeating 5-minute fallback using setInterval.
 *
 * Returns a cleanup function — call it on graceful shutdown.
 */
export function startColdTimelockScheduler(db: Db, queue: Queue<ColdTimelockJobData>): () => void {
  // On-boot reconciliation — non-fatal, log and continue if DB is not ready yet
  reconcileExpiredTimelocks(db, queue).catch((err) => {
    logger.error({ err }, 'On-boot cold timelock reconciliation failed');
  });

  // Periodic fallback: every 5 minutes
  const intervalId = setInterval(() => {
    reconcileExpiredTimelocks(db, queue).catch((err) => {
      logger.error({ err }, 'Periodic cold timelock reconciliation failed');
    });
  }, FALLBACK_INTERVAL_MS);

  // Prevent the interval from blocking process exit
  if (intervalId.unref) intervalId.unref();

  logger.info({ intervalMs: FALLBACK_INTERVAL_MS }, 'Cold timelock scheduler started');

  return () => {
    clearInterval(intervalId);
    logger.info({}, 'Cold timelock scheduler stopped');
  };
}
