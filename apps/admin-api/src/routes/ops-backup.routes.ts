// ops-backup routes — POST /ops/backup/pg-dump + GET /ops/backups
// POST triggers a pg_dump job; GET returns last 20 backup history rows.
// Admin-only: requires ops.killswitch.toggle permission (repurposed as ops.admin-only).
import { desc } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import type { PgBackupJobData } from '../workers/pg-backup.worker.js';

const BackupRow = z.object({
  id: z.string().uuid(),
  triggeredBy: z.string().uuid().nullable(),
  status: z.enum(['pending', 'running', 'done', 'failed']),
  s3Key: z.string().nullable(),
  sizeBytes: z.string().nullable(), // bigint serialized as string
  durationMs: z.number().int().nullable(),
  errorMsg: z.string().nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

const opsBackupRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── POST /ops/backup/pg-dump — trigger a new backup ───────────────────────
  r.post(
    '/ops/backup/pg-dump',
    {
      preHandler: requirePerm('ops.killswitch.toggle'),
      schema: {
        tags: ['ops'],
        response: {
          202: z.object({
            backupId: z.string().uuid(),
            message: z.string(),
            dryRun: z.boolean(),
          }),
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requirePerm ensures session.staff exists
      const staffId = req.session.staff!.id;

      const [row] = await app.db
        .insert(schema.backups)
        .values({
          triggeredBy: staffId,
          status: 'pending',
        })
        .returning({ id: schema.backups.id });

      if (!row) {
        // biome-ignore lint/suspicious/noExplicitAny: error reply bypasses 202-only schema
        return (reply as any)
          .code(500)
          .send({ code: 'INSERT_FAILED', message: 'Failed to create backup row' });
      }

      const jobData: PgBackupJobData = {
        backupId: row.id,
        triggeredBy: staffId,
      };

      await app.backupQueue.add('pg_backup', jobData, {
        attempts: 1, // Backups don't retry automatically — manual re-trigger
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      });

      const dryRun = !process.env.BACKUP_S3_BUCKET;
      return reply.code(202).send({
        backupId: row.id,
        message: dryRun
          ? 'Backup job enqueued (dry-run — BACKUP_S3_BUCKET not configured)'
          : 'Backup job enqueued',
        dryRun,
      });
    }
  );

  // ── GET /ops/backups — last 20 backup history rows ────────────────────────
  r.get(
    '/ops/backups',
    {
      preHandler: requirePerm('ops.read'),
      schema: {
        tags: ['ops'],
        response: {
          200: z.object({ data: z.array(BackupRow) }),
        },
      },
    },
    async (_req, reply) => {
      const rows = await app.db
        .select()
        .from(schema.backups)
        .orderBy(desc(schema.backups.createdAt))
        .limit(20);

      const data = rows.map((r) => ({
        id: r.id,
        triggeredBy: r.triggeredBy ?? null,
        status: r.status as 'pending' | 'running' | 'done' | 'failed',
        s3Key: r.s3Key ?? null,
        sizeBytes: r.sizeBytes !== null ? String(r.sizeBytes) : null,
        durationMs: r.durationMs ?? null,
        errorMsg: r.errorMsg ?? null,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      }));

      return reply.code(200).send({ data });
    }
  );
};

export default opsBackupRoutes;
