output "repo_urls" {
  description = "Map of service name to ECR repository URL"
  value       = { for svc, repo in aws_ecr_repository.services : svc => repo.repository_url }
}

output "repo_arns" {
  description = "Map of service name to ECR repository ARN"
  value       = { for svc, repo in aws_ecr_repository.services : svc => repo.arn }
}

output "admin_api_repo_url" {
  description = "ECR URL for admin-api"
  value       = aws_ecr_repository.services["admin-api"].repository_url
}

output "wallet_engine_repo_url" {
  description = "ECR URL for wallet-engine"
  value       = aws_ecr_repository.services["wallet-engine"].repository_url
}

output "policy_engine_repo_url" {
  description = "ECR URL for policy-engine"
  value       = aws_ecr_repository.services["policy-engine"].repository_url
}

output "registry_id" {
  description = "AWS account ID (ECR registry ID)"
  value       = aws_ecr_repository.services["admin-api"].registry_id
}
