output "task_execution_role_arn" {
  description = "ARN of the shared ECS task-execution role"
  value       = aws_iam_role.task_execution.arn
}

output "task_execution_role_name" {
  description = "Name of the shared ECS task-execution role"
  value       = aws_iam_role.task_execution.name
}

output "task_role_arns" {
  description = "Map of service name to per-service ECS task role ARN"
  value       = { for svc, role in aws_iam_role.task_role : svc => role.arn }
}

output "task_role_names" {
  description = "Map of service name to per-service ECS task role name"
  value       = { for svc, role in aws_iam_role.task_role : svc => role.name }
}
