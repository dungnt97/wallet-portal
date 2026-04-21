variable "env" {
  description = "Deployment environment (staging | prod)"
  type        = string
}

variable "project" {
  description = "Project slug for resource naming"
  type        = string
  default     = "wallet-portal"
}

variable "service_name" {
  description = "Short service name (admin-api | wallet-engine | policy-engine)"
  type        = string
}

variable "image_uri" {
  description = "Full ECR image URI including tag (e.g. 123456.dkr.ecr.us-east-1.amazonaws.com/wallet-portal/admin-api:sha-abc123)"
  type        = string
}

variable "cpu" {
  description = "Task CPU units (256 | 512 | 1024 | 2048 | 4096)"
  type        = number
}

variable "memory" {
  description = "Task memory in MiB"
  type        = number
}

variable "port" {
  description = "Container port the service listens on"
  type        = number
}

variable "env_vars" {
  description = "Non-sensitive environment variables injected into the container"
  type        = map(string)
  default     = {}
}

variable "secret_arns" {
  description = "Map of env-var name to Secrets Manager ARN — injected as secrets in task def"
  type        = map(string)
  default     = {}
}

variable "subnet_ids" {
  description = "Private subnet IDs for the ECS service ENIs"
  type        = list(string)
}

variable "vpc_id" {
  description = "VPC ID for security group creation"
  type        = string
}

variable "target_group_arn" {
  description = "ALB target group ARN to attach the service to"
  type        = string
}

variable "desired_count" {
  description = "Desired number of running tasks"
  type        = number
  default     = 1
}

variable "task_execution_role_arn" {
  description = "ARN of the ECS task-execution IAM role"
  type        = string
}

variable "task_role_arn" {
  description = "ARN of the per-service ECS task IAM role"
  type        = string
}

variable "ecs_cluster_id" {
  description = "ECS cluster ID to deploy the service into"
  type        = string
}

variable "aws_region" {
  description = "AWS region (used for CloudWatch log group ARN construction)"
  type        = string
  default     = "us-east-1"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "use_fargate_spot" {
  description = "Use Fargate Spot capacity provider for cost savings (staging only)"
  type        = bool
  default     = false
}

variable "autoscaling_min" {
  description = "Minimum task count for auto-scaling"
  type        = number
  default     = 1
}

variable "autoscaling_max" {
  description = "Maximum task count for auto-scaling"
  type        = number
  default     = 4
}

variable "autoscaling_cpu_target" {
  description = "Target CPU utilisation percentage for auto-scaling"
  type        = number
  default     = 70
}

variable "health_check_path" {
  description = "HTTP path for container health check"
  type        = string
  default     = "/health"
}
