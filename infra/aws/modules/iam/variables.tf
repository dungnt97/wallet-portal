variable "env" {
  description = "Deployment environment (staging | prod)"
  type        = string
}

variable "project" {
  description = "Project slug for resource naming"
  type        = string
  default     = "wallet-portal"
}

variable "secret_arns" {
  description = "Map of secret name to ARN from secrets-manager module"
  type        = map(string)
}

variable "aws_region" {
  description = "AWS region (used to scope CloudWatch log group ARNs)"
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID (used to scope resource ARNs)"
  type        = string
}
