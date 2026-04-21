output "service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.this.name
}

output "service_id" {
  description = "ECS service ID"
  value       = aws_ecs_service.this.id
}

output "task_definition_arn" {
  description = "ARN of the current task definition revision"
  value       = aws_ecs_task_definition.this.arn
}

output "security_group_id" {
  description = "ECS service security group ID (referenced by RDS/Redis SGs)"
  value       = aws_security_group.ecs_service.id
}

output "log_group_name" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.this.name
}
