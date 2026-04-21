-- Migration 0006: extend sweeps table with user_address_id + created_by
-- Required for sweep candidate tracking and audit trail

ALTER TABLE "sweeps"
  ADD COLUMN IF NOT EXISTS "user_address_id" uuid REFERENCES "user_addresses"("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "created_by" uuid REFERENCES "staff_members"("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "broadcast_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "error_message" text;

-- Unique constraint: prevent double-processing same address at same time
-- Only one non-terminal sweep per user_address
CREATE UNIQUE INDEX IF NOT EXISTS "sweeps_user_address_active_uniq"
  ON "sweeps" ("user_address_id")
  WHERE status NOT IN ('confirmed', 'failed');
