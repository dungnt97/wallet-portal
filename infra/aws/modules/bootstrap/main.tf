# ─────────────────────────────────────────────────────────────────
# Bootstrap — S3 state bucket + DynamoDB lock table.
# Run ONCE per environment out-of-band BEFORE `terraform init`
# in envs/{staging,prod}/.  Uses a LOCAL backend (no chicken-egg).
#
# Usage:
#   cd infra/aws/modules/bootstrap
#   terraform init
#   terraform apply -var="env=staging"
#   terraform apply -var="env=prod"
# ─────────────────────────────────────────────────────────────────

locals {
  bucket_name = "${var.project}-tfstate-${var.env}"
  table_name  = "${var.project}-tf-lock-${var.env}"
}

# ── S3 state bucket ───────────────────────────────────────────────
resource "aws_s3_bucket" "tf_state" {
  bucket = local.bucket_name

  # Prevent accidental deletion of state history.
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name    = local.bucket_name
    Purpose = "terraform-state"
  }
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block all public access — state must never be public.
resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── DynamoDB lock table ───────────────────────────────────────────
resource "aws_dynamodb_table" "tf_lock" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  # Protect lock table from accidental deletion.
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name    = local.table_name
    Purpose = "terraform-lock"
  }
}
