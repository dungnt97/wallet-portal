# ─────────────────────────────────────────────────────────────────
# Secrets Manager — creates 6 secrets with placeholder values.
# IMPORTANT: actual secret values must be set post-apply via:
#   aws secretsmanager put-secret-value --secret-id <arn> --secret-string <value>
# See docs/runbooks/secrets-rotation.md for per-secret procedures.
#
# Secrets created:
#   db_password         — random 32-char, rotated per runbook
#   jwt_secret          — random 64-char hex
#   hd_master_seed      — PLACEHOLDER; set manually (dual-control)
#   webauthn_rpid       — domain-specific, set post-apply
#   internal_bearer_token — random 32-char
#   session_secret      — random 32-char
# ─────────────────────────────────────────────────────────────────

locals {
  path_prefix = "${var.project}/${var.env}"
}

# ── Random values for auto-generated secrets ─────────────────────
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false # hex-safe for JWT
}

resource "random_password" "internal_bearer_token" {
  length  = 32
  special = false
}

resource "random_password" "session_secret" {
  length  = 32
  special = false
}

# ── db_password ───────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${local.path_prefix}/db_password"
  description             = "RDS master password for ${var.env}"
  recovery_window_in_days = var.recovery_window_days

  tags = { Secret = "db_password" }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

# ── jwt_secret ────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.path_prefix}/jwt_secret"
  description             = "JWT signing secret for ${var.env}"
  recovery_window_in_days = var.recovery_window_days

  tags = { Secret = "jwt_secret" }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

# ── hd_master_seed — PLACEHOLDER, dual-control required ──────────
# Value set to a clearly invalid placeholder so ECS tasks fail fast
# if the real seed has not been loaded.  Replace via:
#   aws secretsmanager put-secret-value \
#     --secret-id <arn> --secret-string "$HD_MASTER_SEED"
resource "aws_secretsmanager_secret" "hd_master_seed" {
  name                    = "${local.path_prefix}/hd_master_seed"
  description             = "HD wallet master seed for ${var.env} — DUAL CONTROL REQUIRED"
  recovery_window_in_days = var.recovery_window_days

  tags = { Secret = "hd_master_seed", Sensitivity = "critical" }
}

resource "aws_secretsmanager_secret_version" "hd_master_seed" {
  secret_id     = aws_secretsmanager_secret.hd_master_seed.id
  secret_string = "PLACEHOLDER_REPLACE_WITH_REAL_SEED_BEFORE_USE"
}

# ── webauthn_rpid ─────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "webauthn_rpid" {
  name                    = "${local.path_prefix}/webauthn_rpid"
  description             = "WebAuthn Relying Party ID for ${var.env}"
  recovery_window_in_days = var.recovery_window_days

  tags = { Secret = "webauthn_rpid" }
}

resource "aws_secretsmanager_secret_version" "webauthn_rpid" {
  secret_id     = aws_secretsmanager_secret.webauthn_rpid.id
  secret_string = "PLACEHOLDER_wallet-portal.example.com"
}

# ── internal_bearer_token ─────────────────────────────────────────
resource "aws_secretsmanager_secret" "internal_bearer_token" {
  name                    = "${local.path_prefix}/internal_bearer_token"
  description             = "Internal service-to-service bearer token for ${var.env}"
  recovery_window_in_days = var.recovery_window_days

  tags = { Secret = "internal_bearer_token" }
}

resource "aws_secretsmanager_secret_version" "internal_bearer_token" {
  secret_id     = aws_secretsmanager_secret.internal_bearer_token.id
  secret_string = random_password.internal_bearer_token.result
}

# ── session_secret ────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "session_secret" {
  name                    = "${local.path_prefix}/session_secret"
  description             = "Express session secret for ${var.env}"
  recovery_window_in_days = var.recovery_window_days

  tags = { Secret = "session_secret" }
}

resource "aws_secretsmanager_secret_version" "session_secret" {
  secret_id     = aws_secretsmanager_secret.session_secret.id
  secret_string = random_password.session_secret.result
}

# ── IAM policy doc — read access scoped to exact ARNs ────────────
# Consumed by modules/iam to attach to task roles.
data "aws_iam_policy_document" "secrets_read" {
  statement {
    sid    = "SecretsManagerGetValue"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [
      aws_secretsmanager_secret.db_password.arn,
      aws_secretsmanager_secret.jwt_secret.arn,
      aws_secretsmanager_secret.hd_master_seed.arn,
      aws_secretsmanager_secret.webauthn_rpid.arn,
      aws_secretsmanager_secret.internal_bearer_token.arn,
      aws_secretsmanager_secret.session_secret.arn,
    ]
  }
}
