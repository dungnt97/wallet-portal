-- Migration 0012: Slice 5 — Notifications
-- Creates notifications table + adds notification_prefs JSONB to staff_members.
-- Includes digest tracking columns and partial dedupe index.

-- 1. notifications table — persisted staff-targeted event rows
CREATE TABLE IF NOT EXISTS notifications (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       uuid        NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  event_type     text        NOT NULL,
  severity       text        NOT NULL,
  title          text        NOT NULL,
  body           text,
  payload        jsonb,
  dedupe_key     text,
  read_at        timestamptz NULL,
  digest_sent_at timestamptz NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_severity CHECK (severity IN ('info', 'warning', 'critical'))
);

-- 2. Index: fast unread lookup per staff (most-recent first)
CREATE INDEX IF NOT EXISTS idx_notifications_staff_unread
  ON notifications (staff_id, read_at, created_at DESC);

-- 3. Partial unique index: deduplicate by (staff_id, event_type, dedupe_key)
--    Only applies when dedupe_key is set — allows NULL dedupe_key rows freely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON notifications (staff_id, event_type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- 4. Add notification_prefs JSONB column to staff_members
--    Default provides all channels + all event type categories enabled.
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT
    '{"inApp":true,"email":true,"slack":false,"eventTypes":{"withdrawal":true,"sweep":true,"deposit":true,"killSwitch":true,"reorg":true,"health":true,"coldTimelock":true}}'::jsonb;

-- 5. Back-fill existing staff rows with role-appropriate defaults
--    (column default already applied on ADD COLUMN; this is a no-op for new installations
--     but ensures any NULL-valued rows created before the default are covered)
UPDATE staff_members
SET notification_prefs = '{"inApp":true,"email":true,"slack":false,"eventTypes":{"withdrawal":true,"sweep":true,"deposit":true,"killSwitch":true,"reorg":true,"health":true,"coldTimelock":true}}'::jsonb
WHERE notification_prefs IS NULL;
