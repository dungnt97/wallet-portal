# ── Phase 01 outputs ──────────────────────────────────────────────
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "nat_gateway_id" {
  description = "NAT gateway ID"
  value       = module.vpc.nat_gateway_id
}

# ── Phase 02 outputs (uncomment when data tier is wired) ──────────
# output "rds_endpoint" {
#   description = "RDS instance endpoint"
#   value       = module.rds.endpoint
# }
#
# output "redis_endpoint" {
#   description = "ElastiCache primary endpoint"
#   value       = module.redis.primary_endpoint
# }
#
# output "secret_arns_map" {
#   description = "Map of secret name → ARN"
#   value       = module.secrets.secret_arns
# }

# ── Phase 03 outputs (uncomment when compute tier is wired) ───────
# output "alb_dns_name" {
#   description = "External ALB DNS name"
#   value       = module.alb.alb_dns_name
# }
#
# output "ecs_cluster_name" {
#   description = "ECS cluster name"
#   value       = aws_ecs_cluster.main.name
# }

# ── Phase 04 outputs (uncomment when edge tier is wired) ──────────
# output "cloudfront_domain" {
#   description = "CloudFront distribution domain"
#   value       = module.cloudfront.domain_name
# }
#
# output "cloudfront_distribution_id" {
#   description = "CloudFront distribution ID"
#   value       = module.cloudfront.distribution_id
# }
