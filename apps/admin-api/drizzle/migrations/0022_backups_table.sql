-- Migration 0022: backups table for pg_dump job history
-- Tracks each triggered backup: status, S3 key, size, duration, error

CREATE TABLE IF NOT EXISTS backups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by UUID REFERENCES staff_members(id),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'running', 'done', 'failed')),
  s3_key       TEXT,
  size_bytes   BIGINT,
  duration_ms  INTEGER,
  error_msg    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_backups_created_at ON backups (created_at DESC);
