-- Migration 0018: account settings + staff invite flow
-- Adds locale_pref + phone_number to staff_members.
-- Adds invite_token + invite_expires_at for signed invite links.
-- Extends staff_status enum with 'invited' for pre-onboarding staff rows.

ALTER TYPE staff_status ADD VALUE IF NOT EXISTS 'invited';

ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS locale_pref TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS invite_token TEXT,
  ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;

-- Index for fast token lookup during onboarding
CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_invite_token
  ON staff_members (invite_token)
  WHERE invite_token IS NOT NULL;
