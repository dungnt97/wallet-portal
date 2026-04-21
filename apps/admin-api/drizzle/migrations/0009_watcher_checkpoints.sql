-- Migration 0009: watcher_checkpoints table + reorg_pending deposit status
-- Enables wallet-engine block watchers to resume from last processed block after restart.

-- Add reorg_pending to deposit_status enum
ALTER TYPE "deposit_status" ADD VALUE IF NOT EXISTS 'reorg_pending';

-- Create watcher_checkpoints table (one row per chain)
CREATE TABLE IF NOT EXISTS "watcher_checkpoints" (
  "chain"       chain PRIMARY KEY,
  "last_block"  bigint NOT NULL,
  "last_hash"   text,
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now()
);
