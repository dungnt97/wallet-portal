output "hosted_zone_id" {
  description = "ID of the existing Route53 hosted zone"
  value       = data.aws_route53_zone.this.zone_id
}

output "hosted_zone_name" {
  description = "Name of the existing Route53 hosted zone"
  value       = data.aws_route53_zone.this.name
}

output "ui_fqdn" {
  description = "Fully qualified domain name for the UI (CloudFront alias)"
  value       = aws_route53_record.ui_a.fqdn
}

output "api_fqdn" {
  description = "Fully qualified domain name for the API (ALB alias)"
  value       = aws_route53_record.api_a.fqdn
}
