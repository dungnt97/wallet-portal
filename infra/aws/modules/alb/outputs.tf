output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "ALB DNS name — used by CloudFront origin and Route53 alias"
  value       = aws_lb.this.dns_name
}

output "alb_hosted_zone_id" {
  description = "ALB canonical hosted zone ID — used for Route53 alias records"
  value       = aws_lb.this.zone_id
}

output "alb_security_group_id" {
  description = "ALB security group ID"
  value       = aws_security_group.alb.id
}

output "https_listener_arn" {
  description = "HTTPS listener ARN"
  value       = aws_lb_listener.https.arn
}

output "admin_api_target_group_arn" {
  description = "Target group ARN for admin-api"
  value       = aws_lb_target_group.admin_api.arn
}

output "wallet_engine_target_group_arn" {
  description = "Target group ARN for wallet-engine"
  value       = aws_lb_target_group.wallet_engine.arn
}

output "policy_engine_target_group_arn" {
  description = "Target group ARN for policy-engine"
  value       = aws_lb_target_group.policy_engine.arn
}
