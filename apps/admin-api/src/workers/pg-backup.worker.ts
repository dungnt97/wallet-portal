import { execFile } from 'node:child_process';
import { createReadStream, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
// pg-backup.worker — BullMQ worker that runs pg_dump + uploads to S3.
// Processes jobs from queue `pg_backup` (enqueued by POST /ops/backup/pg-dump).
//
// Dry-run mode (default when BACKUP_S3_BUCKET not set):
//   Logs the pg_dump command that would run and skips the actual dump + upload.
//   The backup row is still created and updated so the UI shows history.
//
// Production setup:
//   BACKUP_S3_BUCKET=my-bucket
//   DATABASE_URL=postgres://...          (used by pg_dump)
//   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION (standard SDK env)
//   Optional: BACKUP_S3_PREFIX=backups/  (default: "backups/")
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { RedisOptions } from 'ioredis';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export const PG_BACKUP_QUEUE = 'pg_backup';

export interface PgBackupJobData {
  backupId: string;
  triggeredBy: string;
}

const execFileAsync = promisify(execFile);

function isDryRun(): boolean {
  return !process.env.BACKUP_S3_BUCKET;
}

/** Upload a local file to S3 using the AWS SDK (loaded dynamically to avoid hard dep). */
async function uploadToS3(localPath: string, s3Key: string): Promise<bigint> {
  // Dynamic import — avoids hard dependency when not in production
  // biome-ignore lint/suspicious/noExplicitAny: dynamic import shape varies by SDK version
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3' as any);
  const { statSync } = await import('node:fs');

  const bucket = process.env.BACKUP_S3_BUCKET as string;
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const client = new S3Client({ region });

  const stat = statSync(localPath);
  const sizeBytes = BigInt(stat.size);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: createReadStream(localPath),
      ContentType: 'application/octet-stream',
      ServerSideEncryption: 'AES256',
    })
  );

  return sizeBytes;
}

export function createPgBackupWorker(db: Db, redisOpts: RedisOptions): Worker<PgBackupJobData> {
  const worker = new Worker<PgBackupJobData>(
    PG_BACKUP_QUEUE,
    async (job) => {
      const { backupId } = job.data;
      const started = Date.now();

      // Mark as running
      await db
        .update(schema.backups)
        .set({ status: 'running' })
        .where(eq(schema.backups.id, backupId));

      const prefix = process.env.BACKUP_S3_PREFIX ?? 'backups/';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const s3Key = `${prefix}${timestamp}-dump.pgdump`;
      const localPath = join(tmpdir(), `${backupId}-dump.pgdump`);
      const dbUrl = process.env.DATABASE_URL ?? '';

      try {
        if (isDryRun()) {
          // Dry-run: log what would happen, skip actual dump
          console.info(
            '[pg-backup] DRY_RUN backupId=%s cmd=pg_dump --format=custom --file=%s <DATABASE_URL>',
            backupId,
            localPath
          );
          const durationMs = Date.now() - started;
          await db
            .update(schema.backups)
            .set({
              status: 'done',
              s3Key: `[dry-run] ${s3Key}`,
              sizeBytes: BigInt(0),
              durationMs,
              completedAt: new Date(),
            })
            .where(eq(schema.backups.id, backupId));
          return;
        }

        // Real dump
        await execFileAsync('pg_dump', ['--format=custom', `--file=${localPath}`, dbUrl]);

        // Upload to S3
        const sizeBytes = await uploadToS3(localPath, s3Key);

        const durationMs = Date.now() - started;
        await db
          .update(schema.backups)
          .set({
            status: 'done',
            s3Key,
            sizeBytes,
            durationMs,
            completedAt: new Date(),
          })
          .where(eq(schema.backups.id, backupId));

        console.info(
          '[pg-backup] Done backupId=%s s3Key=%s sizeBytes=%s durationMs=%d',
          backupId,
          s3Key,
          sizeBytes,
          durationMs
        );
      } catch (err) {
        const durationMs = Date.now() - started;
        await db
          .update(schema.backups)
          .set({
            status: 'failed',
            durationMs,
            errorMsg: String(err),
            completedAt: new Date(),
          })
          .where(eq(schema.backups.id, backupId));
        throw err;
      } finally {
        // Clean up temp file whether success or failure
        try {
          if (!isDryRun()) unlinkSync(localPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    },
    {
      connection: redisOpts,
      concurrency: 1, // Only one backup at a time
    }
  );

  worker.on('failed', (job, err) => {
    console.error('[pg-backup] Job %s failed: %s', job?.id, err);
  });

  return worker;
}
