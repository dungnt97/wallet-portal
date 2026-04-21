# ─────────────────────────────────────────────────────────────────
# ACM — DNS-validated certificate.
# NOTE: CloudFront requires certs in us-east-1.
#       Call this module with a provider alias `aws.us_east_1`
#       from the env root when creating the CloudFront cert.
#       The ALB cert uses the default regional provider.
# ─────────────────────────────────────────────────────────────────

resource "aws_acm_certificate" "this" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  # Allow Terraform to replace cert when domain changes
  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "wp-${var.env}-${var.domain_name}"
  }
}

# ── DNS validation records in Route53 ─────────────────────────────
# for_each handles multiple SANs producing multiple CNAME records.
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.this.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id = var.hosted_zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60

  allow_overwrite = true
}

# Wait for cert to reach ISSUED state before outputs are consumed
resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
