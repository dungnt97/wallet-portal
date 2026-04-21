# ─────────────────────────────────────────────────────────────────
# ECR — 3 private repos: admin-api, wallet-engine, policy-engine.
# Scan on push, lifecycle policy: keep last N tagged, expire
# untagged after configured days.
# ─────────────────────────────────────────────────────────────────

locals {
  services = ["admin-api", "wallet-engine", "policy-engine"]
}

resource "aws_ecr_repository" "services" {
  for_each = toset(local.services)

  name                 = "${var.project}/${each.key}"
  image_tag_mutability = var.image_tag_mutability

  image_scanning_configuration {
    scan_on_push = true
  }

  # Encrypt images at rest with AWS-managed key
  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Service = each.key
  }
}

# ── Lifecycle policy — applied to each repo ───────────────────────
resource "aws_ecr_lifecycle_policy" "services" {
  for_each   = aws_ecr_repository.services
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        # Expire untagged images after N days
        rulePriority = 1
        description  = "Expire untagged images after ${var.untagged_expiry_days} days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = var.untagged_expiry_days
        }
        action = { type = "expire" }
      },
      {
        # Keep only the last N tagged images
        rulePriority = 2
        description  = "Keep last ${var.tagged_count_to_keep} tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v", "sha-", "release-"]
          countType     = "imageCountMoreThan"
          countNumber   = var.tagged_count_to_keep
        }
        action = { type = "expire" }
      }
    ]
  })
}
