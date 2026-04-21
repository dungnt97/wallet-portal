-- Policy Engine SQL Queries (sqlc source)
-- These are read-only queries used by the rule evaluators.

-- name: GetSigningKeyByAddress :one
-- Used by authorized-signer rule: look up active signing key for a given address+chain+tier.
SELECT id, staff_id, chain, address, tier, wallet_type, hw_attested, registered_at, revoked_at
FROM staff_signing_keys
WHERE address = $1
  AND chain = $2::chain
  AND tier = $3::tier
  AND revoked_at IS NULL
LIMIT 1;

-- name: GetStaffMember :one
-- Used to resolve staff role for daily-limit checks.
SELECT id, email, name, role, status, created_at
FROM staff_members
WHERE id = $1;

-- name: SumWithdrawalsToday :one
-- Used by daily-limit rule: total withdrawal amount for a staff member in the last 24h.
-- Excludes cancelled withdrawals. Returns 0 if none.
SELECT COALESCE(SUM(amount), 0)::numeric AS total
FROM withdrawals
WHERE created_by = $1
  AND created_at > now() - interval '24 hours'
  AND status != 'cancelled';

-- name: IsDestinationWhitelisted :one
-- Used by destination-whitelist rule: check if an address is in the allowlist.
SELECT EXISTS(
    SELECT 1 FROM destination_whitelist
    WHERE chain = $1::chain
      AND address = $2
      AND revoked_at IS NULL
) AS whitelisted;

-- name: CountWhitelistEntries :one
-- Used by destination-whitelist rule: if table is empty, allow all (dev mode).
SELECT COUNT(*)::bigint AS total FROM destination_whitelist WHERE revoked_at IS NULL;

-- name: GetWithdrawal :one
-- Used by engine to load withdrawal record for time-lock and other checks.
SELECT id, user_id, chain, token, amount, destination_addr, status, source_tier,
       multisig_op_id, time_lock_expires_at, created_by, created_at, updated_at
FROM withdrawals
WHERE id = $1;

-- name: IsOperationalWallet :one
-- Sweep fast-path: checks if the destination is a registered operational or cold_reserve wallet.
-- Sweep destinations are always hot_safe (operational purpose) — no multisig needed.
SELECT EXISTS(
    SELECT 1 FROM wallets
    WHERE chain = $1::chain
      AND address = $2
      AND purpose IN ('operational', 'cold_reserve')
) AS is_operational;
