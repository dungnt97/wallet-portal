variable "env" {
  description = "Deployment environment (staging | prod)"
  type        = string
}

variable "project" {
  description = "Project slug for resource naming"
  type        = string
  default     = "wallet-portal"
}

variable "vpc_id" {
  description = "VPC ID for ALB and security group placement"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the ALB"
  type        = list(string)
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS listener (regional, same region as ALB)"
  type        = string
}

variable "access_logs_bucket" {
  description = "S3 bucket name for ALB access logs (bucket must have correct bucket policy)"
  type        = string
  default     = ""
}

variable "enable_access_logs" {
  description = "Enable ALB access logs to S3"
  type        = bool
  default     = false
}

variable "health_check_path" {
  description = "Default health check path for target groups"
  type        = string
  default     = "/health"
}

variable "deregistration_delay" {
  description = "Seconds to wait before deregistering a target"
  type        = number
  default     = 30
}
