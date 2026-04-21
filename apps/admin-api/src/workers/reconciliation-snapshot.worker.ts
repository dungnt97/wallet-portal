// reconciliation-snapshot.worker — BullMQ worker for reconciliation runs.
//
// Queues:
//   'reconciliation-run'  — ad-hoc manual trigger jobs
//
// Repeatable jobs registered at startup:
//   reconciliation:cron  — daily at 00:00 UTC  (jobId='recon-daily', idempotent)
//   reconciliation:gc    — weekly Sun 03:00 UTC (jobId='recon-gc', idempotent)
//
// RECON_ENABLED=false → worker processes no jobs; skips cron registration.
// Boot recovery: marks stale 'running' snapshots (>30min) as 'failed'.
import { type Queue, Worker } from 'bullmq';
import { lt, sql } from 'drizzle-orm';
import type { RedisOptions } from 'ioredis';
import type IORedis from 'ioredis';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import type { EmailJobData, SlackJobData } from '../services/notify-staff.service.js';
import { alertOnSnapshotComplete } from '../services/reconciliation-alerter.service.js';
import { runSnapshot } from '../services/reconciliation-snapshot.service.js';

// ── Queue name constants ──────────────────────────────────────────────────────

export const RECON_RUN_QUEUE = 'reconciliation-run';

// ── Job payload ───────────────────────────────────────────────────────────────

export interface ReconRunJobData {
  /** Staff UUID if manually triggered; undefined = cron */
  triggeredBy?: string;
  chain?: string;
  scope?: 'all' | 'hot' | 'cold' | 'users';
}

// ── Boot recovery ─────────────────────────────────────────────────────────────

/**
 * On service startup, mark any 'running' snapshot older than 30 min as 'failed'.
 * These are orphaned from a previous crash/restart.
 */
export async function recoverStaleSnapshots(db: Db): Promise<void> {
  const cutoffIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const updated = await db
    .update(schema.reconciliationSnapshots)
    .set({
      status: 'failed',
      errorMessage: 'timeout: service restarted while snapshot was running',
      completedAt: new Date(),
    })
    .where(
      sql`${schema.reconciliationSnapshots.status} = 'running'
          AND ${schema.reconciliationSnapshots.createdAt} < ${cutoffIso}::timestamptz`
    )
    .returning({ id: schema.reconciliationSnapshots.id });

  if (updated.length > 0) {
    console.warn(
      '[recon-worker] boot-recovery: marked %d stale snapshot(s) as failed',
      updated.length
    );
  }
}

// ── GC: delete snapshots older than retention days ────────────────────────────

async function runGc(db: Db): Promise<void> {
  const retentionDays = Number(process.env.RECON_RETENTION_DAYS ?? '90');
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(schema.reconciliationSnapshots)
    .where(lt(schema.reconciliationSnapshots.createdAt, cutoff))
    .returning({ id: schema.reconciliationSnapshots.id });

  console.info(
    '[recon-worker] gc: deleted %d snapshot(s) older than %d days',
    deleted.length,
    retentionDays
  );
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createReconWorker(
  db: Db,
  redis: IORedis,
  io: SocketIOServer,
  emailQueue: Queue<EmailJobData>,
  slackQueue: Queue<SlackJobData>,
  reconQueue: Queue<ReconRunJobData>,
  redisOpts: RedisOptions
): Worker<ReconRunJobData> {
  if (process.env.RECON_ENABLED === 'false') {
    console.info('[recon-worker] RECON_ENABLED=false — worker skipped');
    // Return a no-op worker that never processes; closed immediately in onClose
    return new Worker<ReconRunJobData>(RECON_RUN_QUEUE, async () => {}, { connection: redisOpts });
  }

  const worker = new Worker<ReconRunJobData>(
    RECON_RUN_QUEUE,
    async (job) => {
      const { triggeredBy, chain, scope } = job.data;

      // GC jobs use a special marker
      if (job.name === 'recon-gc') {
        await runGc(db);
        return;
      }

      const result = await runSnapshot(db, redis, {
        ...(triggeredBy !== undefined && { triggeredBy }),
        ...(chain !== undefined && { chain }),
        ...(scope !== undefined && { scope }),
      });

      // Fire aggregate drift alert (non-fatal)
      const snap = await db.query.reconciliationSnapshots.findFirst({
        where: (t, { eq }) => eq(t.id, result.snapshotId),
        columns: { driftTotalMinor: true },
      });
      await alertOnSnapshotComplete(db, io, emailQueue, slackQueue, {
        snapshotId: result.snapshotId,
        driftCount: result.driftCount,
        criticalCount: result.criticalCount,
        warningCount: result.warningCount,
        driftTotalMinor: snap?.driftTotalMinor ?? 0n,
      });
    },
    { connection: redisOpts, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    console.error('[recon-worker] job %s failed: %s', job?.id, err);
  });

  return worker;
}

// ── Repeatable job registration ───────────────────────────────────────────────

/**
 * Register idempotent repeatable jobs on the reconciliation queue.
 * Safe to call on every startup — BullMQ deduplicates by jobId.
 */
export async function registerReconRepeatableJobs(queue: Queue<ReconRunJobData>): Promise<void> {
  if (process.env.RECON_ENABLED === 'false') return;

  // Daily snapshot — 00:00 UTC
  await queue.add(
    'recon-cron',
    { scope: 'all' },
    {
      jobId: 'recon-daily',
      repeat: { pattern: '0 0 * * *', utc: true },
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 50 },
    }
  );

  // Weekly GC — Sunday 03:00 UTC
  await queue.add(
    'recon-gc',
    {},
    {
      jobId: 'recon-gc',
      repeat: { pattern: '0 3 * * 0', utc: true },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 20 },
    }
  );

  console.info('[recon-worker] repeatable jobs registered: recon-daily + recon-gc');
}
