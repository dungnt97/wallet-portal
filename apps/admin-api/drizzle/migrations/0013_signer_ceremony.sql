-- Migration 0013: Slice 6 — Signer ceremony
-- Creates signer_ceremonies table for tracking add/remove/rotate ceremonies
-- across Safe (BNB) + Squads (Solana) multisigs.

-- 1. signer_ceremonies table
CREATE TABLE IF NOT EXISTS signer_ceremonies (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type    text        NOT NULL
    CONSTRAINT chk_ceremony_op_type CHECK (
      operation_type IN ('signer_add', 'signer_remove', 'signer_rotate')
    ),
  initiated_by      uuid        NOT NULL REFERENCES staff_members(id) ON DELETE RESTRICT,
  -- Staff ids to add as new multisig owners (empty array for remove-only)
  target_add        uuid[]      NOT NULL DEFAULT '{}',
  -- Staff ids to remove as multisig owners (empty array for add-only)
  target_remove     uuid[]      NOT NULL DEFAULT '{}',
  -- Per-chain execution state JSON:
  --   { "bnb":    { "status": "pending|signing|executing|confirmed|partial|failed|cancelled",
  --                 "txHash": "0x...", "multisigOpId": "uuid" },
  --     "solana": { ... } }
  chain_states      jsonb       NOT NULL DEFAULT '{}',
  -- Aggregate ceremony status
  status            text        NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_ceremony_status CHECK (
      status IN ('pending', 'in_progress', 'confirmed', 'partial', 'failed', 'cancelled')
    ),
  -- Optional operator note (reason for the ceremony)
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 2. Index: list active + recent ceremonies efficiently
CREATE INDEX IF NOT EXISTS idx_signer_ceremonies_status_created
  ON signer_ceremonies (status, created_at DESC);

-- 3. Ensure staff_signing_keys.revoked_at exists (added in prior slice; idempotent)
ALTER TABLE staff_signing_keys
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz NULL;
