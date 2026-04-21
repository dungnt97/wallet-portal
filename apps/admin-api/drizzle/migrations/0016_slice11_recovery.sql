-- Migration 0016: Slice 11 — Recovery flow
-- Adds bump/cancel tracking columns to withdrawals + sweeps,
-- adds 'cancelling' to withdrawal_status enum, and creates recovery_actions table.

-- 1. Add 'cancelling' and 'broadcast' to withdrawal_status enum
--    PG 15+ supports ALTER TYPE ... ADD VALUE (non-transactional, runs before rest of migration)
ALTER TYPE withdrawal_status ADD VALUE IF NOT EXISTS 'cancelling';
ALTER TYPE withdrawal_status ADD VALUE IF NOT EXISTS 'broadcast';

-- 2. Add recovery columns to withdrawals
ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS bump_count     int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_bump_at   timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancelled_nonce_tx_hash text NULL,
  ADD COLUMN IF NOT EXISTS nonce          bigint      NULL;

-- 3. Add recovery columns to sweeps
ALTER TABLE sweeps
  ADD COLUMN IF NOT EXISTS bump_count     int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_bump_at   timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancelled_nonce_tx_hash text NULL,
  ADD COLUMN IF NOT EXISTS nonce          bigint      NULL;

-- 4. Create recovery_actions table
CREATE TABLE IF NOT EXISTS recovery_actions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key     text        UNIQUE NOT NULL,
  action_type         text        NOT NULL,
  entity_type         text        NOT NULL,
  entity_id           uuid        NOT NULL,
  chain               text        NOT NULL,
  original_tx_hash    text        NOT NULL,
  new_tx_hash         text        NULL,
  gas_price_gwei      numeric(20, 9) NULL,
  status              text        NOT NULL DEFAULT 'pending',
  initiated_by        uuid        NOT NULL REFERENCES staff_members(id) ON DELETE RESTRICT,
  error_message       text        NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz,
  CONSTRAINT chk_recovery_action_type  CHECK (action_type IN ('bump', 'cancel')),
  CONSTRAINT chk_recovery_entity_type  CHECK (entity_type IN ('withdrawal', 'sweep')),
  CONSTRAINT chk_recovery_status       CHECK (status IN ('pending', 'broadcast', 'confirmed', 'failed'))
);

-- 5. Index: per-entity action history (newest first)
CREATE INDEX IF NOT EXISTS idx_recovery_actions_entity
  ON recovery_actions (entity_type, entity_id, created_at DESC);

-- 6. Index: idempotency-key + TTL queries
CREATE INDEX IF NOT EXISTS idx_recovery_actions_idem_created
  ON recovery_actions (idempotency_key, created_at);
