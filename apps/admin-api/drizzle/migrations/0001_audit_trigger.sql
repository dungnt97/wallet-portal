-- Migration 0001: audit_log hash-chain trigger + append-only enforcement
-- This migration is MANUAL (not drizzle-kit generated) and must be applied
-- after 0000_init.sql.
--
-- Security guarantees provided:
--   1. Append-only: RULE blocks any UPDATE or DELETE on audit_log.
--   2. Hash-chain: BEFORE INSERT trigger computes prev_hash + hash via pgcrypto SHA-256.
--   3. Separation-of-duties: CHECK constraint on withdrawals ensures creator != approver.

-- Require pgcrypto for sha256/digest
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Append-only rules ───────────────────────────────────────────────────────

-- Block UPDATE at the rule level (runs before any trigger, cannot be bypassed
-- by ordinary roles). Superuser can still override if recovery is needed.
CREATE OR REPLACE RULE audit_no_update
  AS ON UPDATE TO audit_log
  DO INSTEAD NOTHING;

CREATE OR REPLACE RULE audit_no_delete
  AS ON DELETE TO audit_log
  DO INSTEAD NOTHING;

-- ─── Hash-chain trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_hash_chain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prev_row_hash TEXT;
BEGIN
  -- Fetch the hash of the most-recently inserted row (order by ctid for insert order)
  SELECT hash
  INTO prev_row_hash
  FROM audit_log
  ORDER BY created_at DESC, ctid DESC
  LIMIT 1;

  -- First row in the table has empty prev_hash
  NEW.prev_hash := COALESCE(prev_row_hash, '');

  -- Compute new hash: sha256 over canonical string of key fields
  -- Format: prev_hash||staff_id||action||resource_type||resource_id||changes||created_at
  NEW.hash := encode(
    digest(
      NEW.prev_hash
      || COALESCE(NEW.staff_id::text, '')
      || NEW.action
      || NEW.resource_type
      || COALESCE(NEW.resource_id, '')
      || COALESCE(NEW.changes::text, '')
      || NEW.created_at::text,
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

-- Attach trigger — BEFORE INSERT so NEW fields are set before the row lands
CREATE TRIGGER audit_hash_chain_trg
  BEFORE INSERT ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_hash_chain();

-- ─── Separation-of-duties: withdrawals ───────────────────────────────────────

-- Enforce creator != approver at DB level (application layer also validates,
-- but belt-and-suspenders matters for a custody system).
-- Note: approver_id column is managed by admin-api service layer; the check
-- references a nullable column added here for forward-compatibility.

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES staff_members(id) ON DELETE RESTRICT;

-- CHECK: a withdrawal cannot be approved by the same staff who created it
ALTER TABLE withdrawals
  ADD CONSTRAINT withdrawals_creator_ne_approver
  CHECK (approver_id IS NULL OR created_by != approver_id);

-- ─── Performance indexes ──────────────────────────────────────────────────────

-- Descending created_at indexes for pagination on high-volume tables
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_desc
  ON audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at_desc
  ON transactions (created_at DESC);

-- FK indexes (not created by drizzle-kit by default)
CREATE INDEX IF NOT EXISTS idx_deposits_user_id
  ON deposits (user_id);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id
  ON withdrawals (user_id);

CREATE INDEX IF NOT EXISTS idx_withdrawals_multisig_op_id
  ON withdrawals (multisig_op_id) WHERE multisig_op_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_multisig_approvals_op_id
  ON multisig_approvals (op_id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx_id
  ON ledger_entries (tx_id);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id
  ON user_addresses (user_id);

CREATE INDEX IF NOT EXISTS idx_staff_signing_keys_staff_id
  ON staff_signing_keys (staff_id);
