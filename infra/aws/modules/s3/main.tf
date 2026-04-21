# ─────────────────────────────────────────────────────────────────
# S3 — UI static asset bucket (private, OAC for CloudFront read)
#       + ALB/CloudFront access logging bucket.
#
# UI bucket: no public access; CloudFront reads via OAC.
# Logging bucket: lifecycle IA→Glacier→expire per configured days.
# ─────────────────────────────────────────────────────────────────

locals {
  name_prefix     = "wp-${var.env}"
  ui_bucket_name  = "wp-ui-${var.env}"
  log_bucket_name = "wp-logs-${var.env}"
}

# ── UI Static Asset Bucket ────────────────────────────────────────
resource "aws_s3_bucket" "ui" {
  bucket = local.ui_bucket_name

  tags = {
    Name    = local.ui_bucket_name
    Purpose = "ui-static-assets"
  }
}

resource "aws_s3_bucket_versioning" "ui" {
  bucket = aws_s3_bucket.ui.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ui" {
  bucket = aws_s3_bucket.ui.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block all public access — CloudFront uses OAC, not public URLs
resource "aws_s3_bucket_public_access_block" "ui" {
  bucket = aws_s3_bucket.ui.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# OAC bucket policy — allow CloudFront service principal only
# Applied only when cloudfront_distribution_arn is provided
resource "aws_s3_bucket_policy" "ui" {
  count  = var.cloudfront_distribution_arn != "" ? 1 : 0
  bucket = aws_s3_bucket.ui.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.ui.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = var.cloudfront_distribution_arn
          }
        }
      }
    ]
  })
}

# ── Logging Bucket (ALB access logs + CloudFront logs) ────────────
resource "aws_s3_bucket" "logs" {
  bucket = local.log_bucket_name

  tags = {
    Name    = local.log_bucket_name
    Purpose = "access-logs"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle: Standard → IA → Glacier → expire
resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "log-lifecycle"
    status = "Enabled"

    # Empty filter = apply rule to all objects in the bucket
    filter {}

    transition {
      days          = var.log_lifecycle_ia_days
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = var.log_lifecycle_glacier_days
      storage_class = "GLACIER"
    }

    expiration {
      days = var.log_lifecycle_expire_days
    }
  }
}

# Allow ALB to write access logs (requires specific bucket-owner-full-control)
resource "aws_s3_bucket_policy" "logs_alb" {
  bucket = aws_s3_bucket.logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ALBAccessLogDelivery"
        Effect = "Allow"
        Principal = {
          # Elastic Load Balancing account ID for us-east-1
          AWS = "arn:aws:iam::127311923021:root"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.logs.arn}/alb-logs/AWSLogs/*"
      },
      {
        Sid    = "CloudFrontLogDelivery"
        Effect = "Allow"
        Principal = {
          Service = "delivery.logs.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.logs.arn}/cf-logs/*"
        Condition = {
          StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control" }
        }
      }
    ]
  })
}
