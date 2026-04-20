-- Migration 0004: destination_whitelist table for policy-engine
-- Phase 08 — additive only, no modifications to existing tables.
--
-- destination_whitelist stores approved withdrawal destination addresses
-- per chain. When this table is empty the policy-engine allows all
-- destinations (dev-mode shortcut). Populate before enabling in prod.

CREATE TABLE IF NOT EXISTS "destination_whitelist" (
    "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "chain"     "chain" NOT NULL,
    "address"   text NOT NULL,
    "label"     text,
    "added_by"  uuid REFERENCES staff_members(id) ON DELETE RESTRICT,
    "added_at"  timestamp with time zone DEFAULT now() NOT NULL,
    "revoked_at" timestamp with time zone
);

-- Partial index: active entries only (revoked_at IS NULL) for fast lookup.
CREATE INDEX IF NOT EXISTS idx_destination_whitelist_chain_addr
    ON destination_whitelist (chain, address)
    WHERE revoked_at IS NULL;
