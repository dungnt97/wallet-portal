CREATE TYPE "public"."chain" AS ENUM('bnb', 'sol');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('pending', 'credited', 'swept', 'failed');--> statement-breakpoint
CREATE TYPE "public"."kyc_tier" AS ENUM('none', 'basic', 'enhanced');--> statement-breakpoint
CREATE TYPE "public"."multisig_status" AS ENUM('pending', 'collecting', 'ready', 'submitted', 'confirmed', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'treasurer', 'operator', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('active', 'suspended', 'offboarded');--> statement-breakpoint
CREATE TYPE "public"."sweep_status" AS ENUM('pending', 'submitted', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('hot', 'cold');--> statement-breakpoint
CREATE TYPE "public"."token" AS ENUM('USDT', 'USDC');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('pending', 'confirmed', 'failed', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."wallet_purpose" AS ENUM('deposit_hd', 'operational', 'cold_reserve');--> statement-breakpoint
CREATE TYPE "public"."wallet_type" AS ENUM('metamask', 'phantom', 'ledger', 'trezor', 'hardware_via_metamask', 'other');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_status" AS ENUM('pending', 'approved', 'time_locked', 'executing', 'completed', 'cancelled', 'failed');--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "multisig_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"op_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"staff_signing_key_id" uuid NOT NULL,
	"signature" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tx_id" uuid NOT NULL,
	"account" text NOT NULL,
	"debit" numeric(36, 18) DEFAULT '0' NOT NULL,
	"credit" numeric(36, 18) DEFAULT '0' NOT NULL,
	"currency" "token" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_staff_id_staff_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_signing_keys" ADD CONSTRAINT "staff_signing_keys_staff_id_staff_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_created_by_staff_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multisig_approvals" ADD CONSTRAINT "multisig_approvals_op_id_multisig_operations_id_fk" FOREIGN KEY ("op_id") REFERENCES "public"."multisig_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multisig_approvals" ADD CONSTRAINT "multisig_approvals_staff_id_staff_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multisig_approvals" ADD CONSTRAINT "multisig_approvals_staff_signing_key_id_staff_signing_keys_id_fk" FOREIGN KEY ("staff_signing_key_id") REFERENCES "public"."staff_signing_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tx_id_transactions_id_fk" FOREIGN KEY ("tx_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;