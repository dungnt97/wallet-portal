-- Migration 0020: manual credit columns on deposits table
-- manual=true marks admin-override deposits (not from block watcher)
-- reason captures the admin's justification (audit trail)
-- credited_by FK to staff_members — who applied the credit

ALTER TABLE deposits
  ADD COLUMN IF NOT EXISTS manual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS credited_by UUID REFERENCES staff_members(id);

CREATE INDEX IF NOT EXISTS ix_deposits_manual ON deposits (credited_by)
  WHERE manual = true;
