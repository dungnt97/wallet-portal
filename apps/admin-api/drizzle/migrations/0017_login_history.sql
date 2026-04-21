-- Migration 0017: staff_login_history table
-- Tracks every login attempt (success + failure) for audit and security page.
-- Indexed on (staff_id, created_at DESC) for efficient per-staff pagination.

CREATE TABLE IF NOT EXISTS staff_login_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID        REFERENCES staff_members(id) ON DELETE CASCADE,
  success     BOOLEAN     NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  failure_reason TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_login_history_staff_created
  ON staff_login_history (staff_id, created_at DESC);
