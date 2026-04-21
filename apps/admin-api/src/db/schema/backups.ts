// backups table — pg_dump job history (migration 0022)
import { bigint, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { staffMembers } from './staff';

export type BackupStatus = 'pending' | 'running' | 'done' | 'failed';

export const backups = pgTable('backups', {
  id: uuid('id').primaryKey().defaultRandom(),
  triggeredBy: uuid('triggered_by').references(() => staffMembers.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending').$type<BackupStatus>(),
  s3Key: text('s3_key'),
  /** Uncompressed dump size in bytes */
  sizeBytes: bigint('size_bytes', { mode: 'bigint' }),
  durationMs: integer('duration_ms'),
  errorMsg: text('error_msg'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export type BackupRow = typeof backups.$inferSelect;
export type NewBackup = typeof backups.$inferInsert;
