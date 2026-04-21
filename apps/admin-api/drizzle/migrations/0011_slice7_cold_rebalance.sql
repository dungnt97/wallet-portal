-- Migration 0011: Slice 7 — cold rebalance + HW attestation blob
-- Adds attestation columns to multisig_approvals.
-- Cold wallet seed is already present via wallets-seed.ts (TS-level upsert),
-- but the migration also ensures cold_reserve rows exist for bnb + sol in case
-- the seed script has not yet been run (idempotent INSERT … ON CONFLICT DO NOTHING).

-- 1. attestation_blob — raw bytes of the hardware-wallet signed payload
ALTER TABLE multisig_approvals
  ADD COLUMN IF NOT EXISTS attestation_blob bytea NULL;

-- 2. attestation_type — which device produced the blob
ALTER TABLE multisig_approvals
  ADD COLUMN IF NOT EXISTS attestation_type text NULL;

-- 3. CHECK constraint: only known device types allowed
ALTER TABLE multisig_approvals
  ADD CONSTRAINT chk_attestation_type
  CHECK (
    attestation_type IS NULL
    OR attestation_type IN ('ledger', 'trezor', 'none')
  );

-- 4. Ensure cold_reserve wallet rows exist for bnb and sol.
-- These mirror the fixtures in wallets-seed.ts so the policy fast-path
-- and destination resolver can always find a registered cold wallet.
INSERT INTO wallets (chain, address, tier, purpose, multisig_addr, policy_config)
VALUES
  (
    'bnb',
    '0xCOLD0SAFE0000000000000000000000000000002',
    'cold',
    'cold_reserve',
    '0xCOLD0SAFE0000000000000000000000000000002',
    '{"dailyLimitUsd":5000000,"timeLockSeconds":172800,"hwRequired":true}'::jsonb
  ),
  (
    'sol',
    'ColdSquadsAddressBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    'cold',
    'cold_reserve',
    'ColdSquadsAddressBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    '{"dailyLimitUsd":5000000,"timeLockSeconds":172800,"hwRequired":true}'::jsonb
  )
ON CONFLICT (address) DO NOTHING;
