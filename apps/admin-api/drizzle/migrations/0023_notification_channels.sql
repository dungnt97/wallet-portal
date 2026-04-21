-- Migration 0023: admin-scoped notification channels + routing rules
-- notification_channels: system-level delivery targets (email/slack/pagerduty/webhook)
-- notification_routing_rules: which event_type → which channel kind

CREATE TABLE IF NOT EXISTS notification_channels (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              TEXT        NOT NULL CHECK (kind IN ('email','slack','pagerduty','webhook')),
  name              TEXT        NOT NULL,
  target            TEXT        NOT NULL,
  enabled           BOOLEAN     NOT NULL DEFAULT TRUE,
  severity_filter   TEXT        NOT NULL DEFAULT 'info' CHECK (severity_filter IN ('info','warn','err')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_notif_channels_kind ON notification_channels (kind);
CREATE INDEX IF NOT EXISTS ix_notif_channels_enabled ON notification_channels (enabled);

CREATE TABLE IF NOT EXISTS notification_routing_rules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   TEXT        NOT NULL,
  severity     TEXT        NOT NULL CHECK (severity IN ('info','warn','err')),
  channel_kind TEXT        NOT NULL CHECK (channel_kind IN ('email','slack','pagerduty','webhook')),
  enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_type, channel_kind)
);

CREATE INDEX IF NOT EXISTS ix_notif_routing_event ON notification_routing_rules (event_type);
CREATE INDEX IF NOT EXISTS ix_notif_routing_enabled ON notification_routing_rules (enabled);

-- Seed: 4 default channels
INSERT INTO notification_channels (id, kind, name, target, enabled, severity_filter) VALUES
  ('00000000-0000-0000-0000-000000000001', 'email',     'treasury@company.io',  'treasury@company.io',              TRUE,  'warn'),
  ('00000000-0000-0000-0000-000000000002', 'slack',     '#treasury-alerts',     'https://hooks.slack.com/placeholder', TRUE,  'info'),
  ('00000000-0000-0000-0000-000000000003', 'pagerduty', 'Treasury PD',          'pd-integration-key-placeholder',   FALSE, 'err'),
  ('00000000-0000-0000-0000-000000000004', 'webhook',   'SIEM webhook',         'https://siem.example.com/hook',     FALSE, 'info')
ON CONFLICT (id) DO NOTHING;

-- Seed: 8 routing rules matching prototype UI
INSERT INTO notification_routing_rules (event_type, severity, channel_kind, enabled) VALUES
  ('withdrawal.created',      'info', 'email',     TRUE),
  ('withdrawal.created',      'info', 'slack',     TRUE),
  ('withdrawal.created',      'info', 'pagerduty', FALSE),
  ('withdrawal.created',      'info', 'webhook',   FALSE),
  ('withdrawal.executed',     'warn', 'email',     TRUE),
  ('withdrawal.executed',     'warn', 'slack',     TRUE),
  ('withdrawal.executed',     'warn', 'pagerduty', FALSE),
  ('withdrawal.executed',     'warn', 'webhook',   TRUE),
  ('withdrawal.approved',     'info', 'email',     FALSE),
  ('withdrawal.approved',     'info', 'slack',     TRUE),
  ('withdrawal.approved',     'info', 'pagerduty', FALSE),
  ('withdrawal.approved',     'info', 'webhook',   FALSE),
  ('deposit.credited',        'info', 'email',     FALSE),
  ('deposit.credited',        'info', 'slack',     TRUE),
  ('deposit.credited',        'info', 'pagerduty', FALSE),
  ('deposit.credited',        'info', 'webhook',   FALSE),
  ('sweep.completed',         'info', 'email',     FALSE),
  ('sweep.completed',         'info', 'slack',     TRUE),
  ('sweep.completed',         'info', 'pagerduty', FALSE),
  ('sweep.completed',         'info', 'webhook',   FALSE),
  ('multisig.threshold_met',  'warn', 'email',     TRUE),
  ('multisig.threshold_met',  'warn', 'slack',     TRUE),
  ('multisig.threshold_met',  'warn', 'pagerduty', TRUE),
  ('multisig.threshold_met',  'warn', 'webhook',   FALSE),
  ('signer.key_rotated',      'warn', 'email',     TRUE),
  ('signer.key_rotated',      'warn', 'slack',     TRUE),
  ('signer.key_rotated',      'warn', 'pagerduty', TRUE),
  ('signer.key_rotated',      'warn', 'webhook',   FALSE),
  ('killswitch.enabled',      'err',  'email',     TRUE),
  ('killswitch.enabled',      'err',  'slack',     TRUE),
  ('killswitch.enabled',      'err',  'pagerduty', TRUE),
  ('killswitch.enabled',      'err',  'webhook',   TRUE)
ON CONFLICT (event_type, channel_kind) DO NOTHING;
