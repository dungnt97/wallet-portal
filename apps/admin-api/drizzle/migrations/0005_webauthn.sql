-- Migration 0005: staff_webauthn_credentials table for WebAuthn step-up auth
-- Phase 06 — additive only, no modifications to existing tables.
--
-- Stores one row per registered authenticator (security key / passkey) per staff member.
-- credential_id is unique globally — WebAuthn spec guarantees uniqueness across RPs.
-- counter MUST be checked on every assertion to detect cloned authenticators.

CREATE TABLE IF NOT EXISTS "staff_webauthn_credentials" (
    "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "staff_id"      uuid NOT NULL
                        REFERENCES "staff_members"("id") ON DELETE CASCADE,
    "credential_id" text NOT NULL,
    "public_key"    bytea NOT NULL,
    "counter"       bigint NOT NULL DEFAULT 0,
    "transports"    text[] NOT NULL DEFAULT '{}',
    "device_name"   text,
    "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
    "last_used_at"  timestamp with time zone,
    CONSTRAINT "staff_webauthn_credentials_credential_id_unique" UNIQUE ("credential_id")
);

CREATE INDEX IF NOT EXISTS "staff_webauthn_credentials_staff_id_idx"
    ON "staff_webauthn_credentials" ("staff_id");
