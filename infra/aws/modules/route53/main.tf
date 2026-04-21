# ─────────────────────────────────────────────────────────────────
# Route53 — aliases for CloudFront (UI) and ALB (API).
# Assumes the hosted zone for domain_name already exists.
# Shared zone across envs; per-env subdomains:
#   prod:    wallet-portal.example.com  → CloudFront
#            api.wallet-portal.example.com → ALB
#   staging: staging.wallet-portal.example.com → CloudFront
#            api.staging.wallet-portal.example.com → ALB
# ─────────────────────────────────────────────────────────────────

# Look up the existing hosted zone — must be created out-of-band
data "aws_route53_zone" "this" {
  # For staging.wallet-portal.example.com, the zone is wallet-portal.example.com
  name         = join(".", slice(split(".", var.domain_name), 1, length(split(".", var.domain_name))))
  private_zone = false
}

# ── A record (IPv4) — UI → CloudFront ─────────────────────────────
resource "aws_route53_record" "ui_a" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# ── AAAA record (IPv6) — UI → CloudFront ──────────────────────────
resource "aws_route53_record" "ui_aaaa" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# ── A record — API subdomain → ALB ────────────────────────────────
resource "aws_route53_record" "api_a" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_hosted_zone_id
    evaluate_target_health = true
  }
}

# ── AAAA record — API subdomain → ALB ────────────────────────────
resource "aws_route53_record" "api_aaaa" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = "api.${var.domain_name}"
  type    = "AAAA"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_hosted_zone_id
    evaluate_target_health = true
  }
}
