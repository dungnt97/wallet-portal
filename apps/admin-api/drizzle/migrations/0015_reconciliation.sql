-- Migration 0015: Slice 10 — Reconciliation
-- Creates reconciliation_snapshots and reconciliation_drifts tables for
-- on-chain vs ledger drift detection.

-- 1. reconciliation_snapshots — one row per snapshot run
CREATE TABLE IF NOT EXISTS reconciliation_snapshots (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  triggered_by     uuid        REFERENCES staff_members(id) ON DELETE SET NULL, -- NULL = cron
  status           text        NOT NULL DEFAULT 'running',
  chain            text,        -- NULL = all chains
  scope            text        NOT NULL DEFAULT 'all',
  on_chain_total_minor  bigint,
  ledger_total_minor    bigint,
  drift_total_minor     bigint,
  error_message    text,
  completed_at     timestamptz,
  CONSTRAINT chk_snapshot_status   CHECK (status IN ('running','completed','failed','cancelled')),
  CONSTRAINT chk_snapshot_scope    CHECK (scope IN ('all','hot','cold','users'))
);

-- 2. reconciliation_drifts — per-address drift rows per snapshot
CREATE TABLE IF NOT EXISTS reconciliation_drifts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id      uuid        NOT NULL REFERENCES reconciliation_snapshots(id) ON DELETE CASCADE,
  chain            text        NOT NULL,
  token            text        NOT NULL,
  address          text        NOT NULL,
  account_label    text        NOT NULL,
  on_chain_minor   bigint      NOT NULL,
  ledger_minor     bigint      NOT NULL,
  drift_minor      bigint      NOT NULL,
  severity         text        NOT NULL,
  suppressed_reason text,       -- e.g. 'in_flight_withdrawal'
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_drift_severity CHECK (severity IN ('info','warning','critical'))
);

-- 3. Indexes on reconciliation_drifts
CREATE INDEX IF NOT EXISTS idx_recon_drifts_snapshot
  ON reconciliation_drifts (snapshot_id);

CREATE INDEX IF NOT EXISTS idx_recon_drifts_chain_token_addr
  ON reconciliation_drifts (chain, token, address);

-- 4. Index on reconciliation_snapshots for status + created_at queries
CREATE INDEX IF NOT EXISTS idx_recon_snapshots_status_created
  ON reconciliation_snapshots (status, created_at DESC);

-- 5. Composite index on ledger_entries (account, currency) for fast aggregation
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_currency
  ON ledger_entries (account, currency);
