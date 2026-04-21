# ─────────────────────────────────────────────────────────────────
# IAM — ECS task-execution role (shared) + per-service task roles.
#
# task-execution role: used by ECS agent to pull ECR images,
#   write CloudWatch logs, and fetch Secrets Manager values at
#   container startup.  No wildcard actions, no wildcard resources.
#
# per-service task roles: assumed by running container processes.
#   Currently no AWS API permissions needed at runtime; extend here
#   as services require (e.g. S3 presign, SQS, etc.).
# ─────────────────────────────────────────────────────────────────

locals {
  name_prefix = "wp-${var.env}"
  services    = ["admin-api", "wallet-engine", "policy-engine"]
}

# ── Trust policy — ECS tasks ──────────────────────────────────────
data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    sid     = "ECSTasksAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ────────────────────────────────────────────────────────────────
# TASK-EXECUTION ROLE
# ────────────────────────────────────────────────────────────────
resource "aws_iam_role" "task_execution" {
  name               = "${local.name_prefix}-ecs-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json

  tags = { Role = "ecs-task-execution" }
}

# ECR pull permissions — scoped to this account/region
data "aws_iam_policy_document" "ecr_pull" {
  statement {
    sid    = "ECRGetAuthToken"
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken",
    ]
    # GetAuthorizationToken has no resource-level permission — must be *
    resources = ["*"]
  }

  statement {
    sid    = "ECRPullImage"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
    ]
    resources = [
      "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/wallet-portal/*",
    ]
  }
}

resource "aws_iam_policy" "ecr_pull" {
  name        = "${local.name_prefix}-ecr-pull"
  description = "Allow ECS task-execution role to pull from wallet-portal ECR repos"
  policy      = data.aws_iam_policy_document.ecr_pull.json
}

resource "aws_iam_role_policy_attachment" "task_execution_ecr" {
  role       = aws_iam_role.task_execution.name
  policy_arn = aws_iam_policy.ecr_pull.arn
}

# CloudWatch Logs — scoped to /ecs/wp-{env}/* log groups
data "aws_iam_policy_document" "cloudwatch_logs" {
  statement {
    sid    = "CloudWatchLogsWrite"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = [
      "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/ecs/${local.name_prefix}/*",
      "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/ecs/${local.name_prefix}/*:*",
    ]
  }
}

resource "aws_iam_policy" "cloudwatch_logs" {
  name        = "${local.name_prefix}-cloudwatch-logs"
  description = "Allow ECS task-execution role to write to /ecs/${local.name_prefix} log groups"
  policy      = data.aws_iam_policy_document.cloudwatch_logs.json
}

resource "aws_iam_role_policy_attachment" "task_execution_logs" {
  role       = aws_iam_role.task_execution.name
  policy_arn = aws_iam_policy.cloudwatch_logs.arn
}

# Secrets Manager — scoped to exact ARNs from secrets-manager module
data "aws_iam_policy_document" "secrets_get" {
  statement {
    sid    = "SecretsManagerGetValue"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = values(var.secret_arns)
  }
}

resource "aws_iam_policy" "secrets_get" {
  name        = "${local.name_prefix}-secrets-get"
  description = "Allow ECS task-execution role to fetch Secrets Manager values"
  policy      = data.aws_iam_policy_document.secrets_get.json
}

resource "aws_iam_role_policy_attachment" "task_execution_secrets" {
  role       = aws_iam_role.task_execution.name
  policy_arn = aws_iam_policy.secrets_get.arn
}

# ────────────────────────────────────────────────────────────────
# PER-SERVICE TASK ROLES
# Container process identity — no AWS API access by default.
# Extend with additional policy attachments as services require.
# ────────────────────────────────────────────────────────────────
resource "aws_iam_role" "task_role" {
  for_each = toset(local.services)

  name               = "${local.name_prefix}-${each.key}-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json

  tags = {
    Role    = "ecs-task-role"
    Service = each.key
  }
}
