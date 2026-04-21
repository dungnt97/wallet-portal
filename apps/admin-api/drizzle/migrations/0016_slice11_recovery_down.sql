-- Migration 0016 DOWN: Slice 11 — Recovery flow rollback
-- Drops recovery_actions table, removes added columns from withdrawals + sweeps.
-- Note: enum values 'cancelling' + 'broadcast' are kept as tombstones
-- (Postgres < 14 cannot drop enum values; rename the type if a full drop is needed).

-- 1. Drop recovery_actions table + its indexes (CASCADE handles FK constraints)
DROP TABLE IF EXISTS recovery_actions;

-- 2. Remove recovery columns from withdrawals
ALTER TABLE withdrawals
  DROP COLUMN IF EXISTS bump_count,
  DROP COLUMN IF EXISTS last_bump_at,
  DROP COLUMN IF EXISTS cancelled_nonce_tx_hash,
  DROP COLUMN IF EXISTS nonce;

-- 3. Remove recovery columns from sweeps
ALTER TABLE sweeps
  DROP COLUMN IF EXISTS bump_count,
  DROP COLUMN IF EXISTS last_bump_at,
  DROP COLUMN IF EXISTS cancelled_nonce_tx_hash,
  DROP COLUMN IF EXISTS nonce;

-- 4. Enum tombstone note:
--    'cancelling' and 'broadcast' remain in withdrawal_status enum as unused values.
--    To fully remove: rename type, create new type without them, alter column, drop old type.
--    ALTER TYPE withdrawal_status RENAME TO withdrawal_status_old;
--    CREATE TYPE withdrawal_status AS ENUM ('pending','approved','time_locked','executing','completed','cancelled','failed');
--    ALTER TABLE withdrawals ALTER COLUMN status TYPE withdrawal_status USING status::text::withdrawal_status;
--    DROP TYPE withdrawal_status_old;
