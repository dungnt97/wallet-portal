CREATE TYPE "public"."chain" AS ENUM('bnb', 'sol');
CREATE TYPE "public"."deposit_status" AS ENUM('pending', 'credited', 'swept', 'failed');
CREATE TYPE "public"."kyc_tier" AS ENUM('none', 'basic', 'enhanced');
CREATE TYPE "public"."multisig_status" AS ENUM('pending', 'collecting', 'ready', 'submitted', 'confirmed', 'expired', 'failed');
CREATE TYPE "public"."role" AS ENUM('admin', 'treasurer', 'operator', 'viewer');
CREATE TYPE "public"."staff_status" AS ENUM('active', 'suspended', 'offboarded');
CREATE TYPE "public"."sweep_status" AS ENUM('pending', 'submitted', 'confirmed', 'failed');
CREATE TYPE "public"."tier" AS ENUM('hot', 'cold');
CREATE TYPE "public"."token" AS ENUM('USDT', 'USDC');
CREATE TYPE "public"."tx_status" AS ENUM('pending', 'confirmed', 'failed', 'dropped');
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'closed');
CREATE TYPE "public"."wallet_purpose" AS ENUM('deposit_hd', 'operational', 'cold_reserve');
CREATE TYPE "public"."wallet_type" AS ENUM('metamask', 'phantom', 'ledger', 'trezor', 'hardware_via_metamask', 'other');
CREATE TYPE "public"."withdrawal_status" AS ENUM('pending', 'approved', 'time_locked', 'executing', 'completed', 'cancelled', 'failed');
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"changes" jsonb,
	"ip_addr" text,
	"ua" text,
	"prev_hash" text,
	"hash" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chain" "chain" NOT NULL,
	"token" "token" NOT NULL,
	"amount" numeric(36, 18) NOT NULL,
	"status" "deposit_status" DEFAULT 'pending' NOT NULL,
	"confirmed_blocks" integer DEFAULT 0 NOT NULL,
	"tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"status" "staff_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_email_unique" UNIQUE("email")
);

CREATE TABLE "staff_signing_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"chain" "chain" NOT NULL,
	"address" text NOT NULL,
	"tier" "tier" NOT NULL,
	"wallet_type" "wallet_type" NOT NULL,
	"hw_attested" boolean DEFAULT false NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);

CREATE TABLE "user_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chain" "chain" NOT NULL,
	"address" text NOT NULL,
	"derivation_path" text,
	"tier" "tier" DEFAULT 'hot' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_addresses_address_unique" UNIQUE("address")
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"kyc_tier" "kyc_tier" DEFAULT 'none' NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" "chain" NOT NULL,
	"address" text NOT NULL,
	"tier" "tier" NOT NULL,
	"purpose" "wallet_purpose" NOT NULL,
	"multisig_addr" text,
	"derivation_path" text,
	"policy_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_address_unique" UNIQUE("address")
);

CREATE TABLE "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chain" "chain" NOT NULL,
	"token" "token" NOT NULL,
	"amount" numeric(36, 18) NOT NULL,
	"destination_addr" text NOT NULL,
	"status" "withdrawal_status" DEFAULT 'pending' NOT NULL,
	"source_tier" "tier" NOT NULL,
	"multisig_op_id" uuid,
	"time_lock_expires_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "multisig_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"op_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"staff_signing_key_id" uuid NOT NULL,
	"signature" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "multisig_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"withdrawal_id" uuid,
	"chain" "chain" NOT NULL,
	"operation_type" text NOT NULL,
	"multisig_addr" text NOT NULL,
	"required_sigs" integer NOT NULL,
	"collected_sigs" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "multisig_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sweeps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" "chain" NOT NULL,
	"token" "token" NOT NULL,
	"from_addr" text NOT NULL,
	"to_multisig" text NOT NULL,
	"amount" numeric(36, 18) NOT NULL,
	"status" "sweep_status" DEFAULT 'pending' NOT NULL,
	"tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hash" text NOT NULL,
	"chain" "chain" NOT NULL,
	"from_addr" text NOT NULL,
	"to_addr" text NOT NULL,
	"amount" numeric(36, 18) NOT NULL,
	"token" "token" NOT NULL,
	"status" "tx_status" DEFAULT 'pending' NOT NULL,
	"block_number" bigint,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_hash_unique" UNIQUE("hash")
);

CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tx_id" uuid NOT NULL,
	"account" text NOT NULL,
	"debit" numeric(36, 18) DEFAULT '0' NOT NULL,
	"credit" numeric(36, 18) DEFAULT '0' NOT NULL,
	"currency" "token" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_staff_id_staff_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "staff_signing_keys" ADD CONSTRAINT "staff_signing_keys_staff_id_staff_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_members"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_created_by_staff_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_members"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "multisig_approvals" ADD CONSTRAINT "multisig_approvals_op_id_multisig_operations_id_fk" FOREIGN KEY ("op_id") REFERENCES "public"."multisig_operations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "multisig_approvals" ADD CONSTRAINT "multisig_approvals_staff_id_staff_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_members"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "multisig_approvals" ADD CONSTRAINT "multisig_approvals_staff_signing_key_id_staff_signing_keys_id_fk" FOREIGN KEY ("staff_signing_key_id") REFERENCES "public"."staff_signing_keys"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tx_id_transactions_id_fk" FOREIGN KEY ("tx_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;-- Migration 0001: audit_log hash-chain trigger + append-only enforcement
-- This migration is MANUAL (not drizzle-kit generated) and must be applied
-- after 0000_init.sql.
--
-- Security guarantees provided:
--   1. Append-only: RULE blocks any UPDATE or DELETE on audit_log.
--   2. Hash-chain: BEFORE INSERT trigger computes prev_hash + hash via pgcrypto SHA-256.
--   3. Separation-of-duties: CHECK constraint on withdrawals ensures creator != approver.

-- Require pgcrypto for sha256/digest
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Append-only rules ───────────────────────────────────────────────────────

-- Block UPDATE at the rule level (runs before any trigger, cannot be bypassed
-- by ordinary roles). Superuser can still override if recovery is needed.
CREATE OR REPLACE RULE audit_no_update
  AS ON UPDATE TO audit_log
  DO INSTEAD NOTHING;

CREATE OR REPLACE RULE audit_no_delete
  AS ON DELETE TO audit_log
  DO INSTEAD NOTHING;

-- ─── Hash-chain trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_hash_chain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prev_row_hash TEXT;
BEGIN
  -- Fetch the hash of the most-recently inserted row (order by ctid for insert order)
  SELECT hash
  INTO prev_row_hash
  FROM audit_log
  ORDER BY created_at DESC, ctid DESC
  LIMIT 1;

  -- First row in the table has empty prev_hash
  NEW.prev_hash := COALESCE(prev_row_hash, '');

  -- Compute new hash: sha256 over canonical string of key fields
  -- Format: prev_hash||staff_id||action||resource_type||resource_id||changes||created_at
  NEW.hash := encode(
    digest(
      NEW.prev_hash
      || COALESCE(NEW.staff_id::text, '')
      || NEW.action
      || NEW.resource_type
      || COALESCE(NEW.resource_id, '')
      || COALESCE(NEW.changes::text, '')
      || NEW.created_at::text,
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

-- Attach trigger — BEFORE INSERT so NEW fields are set before the row lands
CREATE TRIGGER audit_hash_chain_trg
  BEFORE INSERT ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_hash_chain();

-- ─── Separation-of-duties: withdrawals ───────────────────────────────────────

-- Enforce creator != approver at DB level (application layer also validates,
-- but belt-and-suspenders matters for a custody system).
-- Note: approver_id column is managed by admin-api service layer; the check
-- references a nullable column added here for forward-compatibility.

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES staff_members(id) ON DELETE RESTRICT;

-- CHECK: a withdrawal cannot be approved by the same staff who created it
ALTER TABLE withdrawals
  ADD CONSTRAINT withdrawals_creator_ne_approver
  CHECK (approver_id IS NULL OR created_by != approver_id);

-- ─── Performance indexes ──────────────────────────────────────────────────────

-- Descending created_at indexes for pagination on high-volume tables
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_desc
  ON audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at_desc
  ON transactions (created_at DESC);

-- FK indexes (not created by drizzle-kit by default)
CREATE INDEX IF NOT EXISTS idx_deposits_user_id
  ON deposits (user_id);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id
  ON withdrawals (user_id);

CREATE INDEX IF NOT EXISTS idx_withdrawals_multisig_op_id
  ON withdrawals (multisig_op_id) WHERE multisig_op_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_multisig_approvals_op_id
  ON multisig_approvals (op_id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx_id
  ON ledger_entries (tx_id);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id
  ON user_addresses (user_id);

CREATE INDEX IF NOT EXISTS idx_staff_signing_keys_staff_id
  ON staff_signing_keys (staff_id);

-- Migration 0004: destination_whitelist table for policy-engine
-- Added by Phase 08; additive only (no modifications to existing tables)
CREATE TABLE IF NOT EXISTS "destination_whitelist" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "chain" "chain" NOT NULL,
    "address" text NOT NULL,
    "label" text,
    "added_by" uuid REFERENCES staff_members(id) ON DELETE RESTRICT,
    "added_at" timestamp with time zone DEFAULT now() NOT NULL,
    "revoked_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS idx_destination_whitelist_chain_addr
    ON destination_whitelist (chain, address) WHERE revoked_at IS NULL;
