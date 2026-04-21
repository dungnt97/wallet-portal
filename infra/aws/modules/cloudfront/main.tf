# ─────────────────────────────────────────────────────────────────
# CloudFront — distribution with 2 origins:
#   1. S3 (default behaviour — UI static assets via OAC)
#   2. ALB (/api/*, /wallet/*, /policy/* — no caching)
#
# Features:
#   - HTTPS-only, TLS 1.2+, gzip + brotli
#   - Custom error pages: 403+404 → /index.html (SPA routing)
#   - WAF association (AWS-managed core rule set ARN supplied externally)
#   - Price class 100 (US + EU only — cheapest)
#   - OAC for S3 origin (Origin Access Control, supersedes OAI)
#   - Cache disabled for API paths (no-store)
# ─────────────────────────────────────────────────────────────────

locals {
  name_prefix   = "wp-${var.env}"
  s3_origin_id  = "s3-ui-origin"
  alb_origin_id = "alb-api-origin"
}

# ── Origin Access Control (OAC) for S3 ────────────────────────────
resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "${local.name_prefix}-s3-oac"
  description                       = "OAC for ${local.name_prefix} UI S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── Cache Policy — static assets (long TTL) ───────────────────────
resource "aws_cloudfront_cache_policy" "static_assets" {
  name        = "${local.name_prefix}-static-assets"
  comment     = "Cache policy for UI static assets"
  default_ttl = var.default_ttl
  max_ttl     = var.max_ttl
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# ── Cache Policy — API paths (no caching) ─────────────────────────
resource "aws_cloudfront_cache_policy" "api_no_cache" {
  name        = "${local.name_prefix}-api-no-cache"
  comment     = "Disabled cache for API/wallet/policy paths"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# ── Origin Request Policy — forward all headers + cookies to ALB ──
resource "aws_cloudfront_origin_request_policy" "alb_forward_all" {
  name    = "${local.name_prefix}-alb-forward-all"
  comment = "Forward headers, cookies, and query strings to ALB"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "allViewer"
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

# ── CloudFront Distribution ────────────────────────────────────────
resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = var.price_class
  aliases             = [var.domain_name]
  comment             = "${local.name_prefix} distribution"
  default_root_object = "index.html"

  web_acl_id = var.web_acl_arn != "" ? var.web_acl_arn : null

  # ── S3 origin (UI static assets) ──────────────────────────────
  origin {
    domain_name              = var.s3_bucket_regional_domain
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  # ── ALB origin (API / wallet / policy) ────────────────────────
  origin {
    domain_name = var.alb_dns_name
    origin_id   = local.alb_origin_id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # ── Default behaviour — S3 (SPA static assets) ────────────────
  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.static_assets.id
  }

  # ── /api/* → ALB (no cache) ───────────────────────────────────
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = local.alb_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = false
    cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.alb_forward_all.id
  }

  # ── /wallet/* → ALB (no cache) ────────────────────────────────
  ordered_cache_behavior {
    path_pattern             = "/wallet/*"
    target_origin_id         = local.alb_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = false
    cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.alb_forward_all.id
  }

  # ── /policy/* → ALB (no cache) ───────────────────────────────
  ordered_cache_behavior {
    path_pattern             = "/policy/*"
    target_origin_id         = local.alb_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = false
    cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.alb_forward_all.id
  }

  # ── SPA custom error pages — 403/404 → /index.html 200 ───────
  # Short TTL (60s) to avoid caching stale error rewrites after deploy
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 60
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 60
  }

  # ── TLS certificate ────────────────────────────────────────────
  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # ── Access logs ────────────────────────────────────────────────
  dynamic "logging_config" {
    for_each = var.logs_bucket_id != "" ? [1] : []
    content {
      bucket          = "${var.logs_bucket_id}.s3.amazonaws.com"
      prefix          = "cf-logs/"
      include_cookies = false
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name = "${local.name_prefix}-cf"
  }
}
