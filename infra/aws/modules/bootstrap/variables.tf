variable "env" {
  description = "Deployment environment (staging | prod)"
  type        = string
  validation {
    condition     = contains(["staging", "prod"], var.env)
    error_message = "env must be 'staging' or 'prod'."
  }
}

variable "aws_region" {
  description = "AWS region for state bucket and lock table"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project slug used in resource names"
  type        = string
  default     = "wallet-portal"
}
