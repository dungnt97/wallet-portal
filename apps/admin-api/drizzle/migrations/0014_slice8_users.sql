-- Migration 0014 — Slice 8 user management
-- Adds derivation_index to user_addresses for HD wallet index tracking
-- Adds unique constraints for (chain, derivation_index) and (user_id, chain)

ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS derivation_index integer;

-- Backfill: existing rows get sequential index per chain ordered by created_at (0-based)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY chain ORDER BY created_at) - 1 AS idx
  FROM user_addresses
)
UPDATE user_addresses
SET derivation_index = ranked.idx
FROM ranked
WHERE user_addresses.id = ranked.id
  AND user_addresses.derivation_index IS NULL;

-- Set NOT NULL after backfill
ALTER TABLE user_addresses ALTER COLUMN derivation_index SET NOT NULL;

-- Unique index: one derivation_index per chain (global, ensures HD slot uniqueness)
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_addresses_chain_idx
  ON user_addresses(chain, derivation_index);

-- Unique index: one address per (user_id, chain) — user gets exactly one BNB + one SOL addr
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_addresses_user_chain
  ON user_addresses(user_id, chain);

-- Index for fast user lookup
CREATE INDEX IF NOT EXISTS ix_user_addresses_user
  ON user_addresses(user_id);
