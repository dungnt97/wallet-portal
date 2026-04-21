# ─────────────────────────────────────────────────────────────────
# RDS — Postgres 16, gp3, KMS-encrypted, forced SSL,
#        7-day automated backups, deletion_protection in prod.
# ─────────────────────────────────────────────────────────────────

locals {
  name_prefix = "wp-${var.env}"
}

# ── Security Group ────────────────────────────────────────────────
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "Allow inbound Postgres 5432 from ECS tasks only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Postgres from ECS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.ecs_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-rds-sg"
  }
}

# ── DB Subnet Group ───────────────────────────────────────────────
resource "aws_db_subnet_group" "this" {
  name        = "${local.name_prefix}-rds-subnet-group"
  description = "Private subnets for RDS"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Name = "${local.name_prefix}-rds-subnet-group"
  }
}

# ── Parameter Group — force SSL ───────────────────────────────────
resource "aws_db_parameter_group" "postgres16" {
  name        = "${local.name_prefix}-pg16-params"
  family      = "postgres16"
  description = "Wallet Portal Postgres 16 parameter group"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = {
    Name = "${local.name_prefix}-pg16-params"
  }
}

# ── KMS key for RDS encryption ────────────────────────────────────
resource "aws_kms_key" "rds" {
  description             = "KMS key for ${local.name_prefix} RDS encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name = "${local.name_prefix}-rds-kms"
  }
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${local.name_prefix}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# ── RDS Instance ──────────────────────────────────────────────────
resource "aws_db_instance" "this" {
  identifier = "${local.name_prefix}-postgres"

  engine            = "postgres"
  engine_version    = "16"
  instance_class    = var.instance_class
  allocated_storage = var.allocated_storage_gb
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = aws_kms_key.rds.arn

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.postgres16.name

  # Backups
  backup_retention_period = var.backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  # Auto minor version upgrades (major upgrades manual via runbook)
  auto_minor_version_upgrade = true

  # Snapshot on destroy for safety
  final_snapshot_identifier = "${local.name_prefix}-postgres-final-snapshot"
  skip_final_snapshot       = false

  deletion_protection = var.deletion_protection

  # Performance Insights (free tier 7d retention)
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  tags = {
    Name = "${local.name_prefix}-postgres"
  }
}
