output "certificate_arn" {
  description = "ACM certificate ARN (use after validation completes)"
  value       = aws_acm_certificate_validation.this.certificate_arn
}

output "certificate_domain" {
  description = "Primary domain of the certificate"
  value       = aws_acm_certificate.this.domain_name
}

output "certificate_status" {
  description = "Certificate validation status"
  value       = aws_acm_certificate.this.status
}
