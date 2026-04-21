-- Migration 0019: user risk tier + reason + audit columns
-- risk_tier: low (default) | medium | high | frozen
-- frozen tier blocks all withdrawals via policy engine multiplier

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS risk_tier TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_tier IN ('low', 'medium', 'high', 'frozen')),
  ADD COLUMN IF NOT EXISTS risk_reason TEXT,
  ADD COLUMN IF NOT EXISTS risk_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS risk_updated_by UUID REFERENCES staff_members(id);

CREATE INDEX IF NOT EXISTS ix_users_risk_tier ON users (risk_tier)
  WHERE risk_tier != 'low';
