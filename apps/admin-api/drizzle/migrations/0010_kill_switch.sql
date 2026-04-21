-- Migration 0010: system_kill_switch singleton table
-- Global kill-switch flag. Only one row ever exists (id=1 enforced by CHECK).
-- Toggle via POST /ops/kill-switch (WebAuthn step-up required).

CREATE TABLE system_kill_switch (
  id   int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled             bool        NOT NULL DEFAULT false,
  reason              text,
  updated_by_staff_id uuid        REFERENCES staff_members(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Seed the single row with kill-switch disabled
INSERT INTO system_kill_switch (id, enabled, reason, updated_by_staff_id, updated_at)
VALUES (1, false, NULL, NULL, now());
