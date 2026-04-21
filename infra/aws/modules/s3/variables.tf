variable "env" {
  description = "Deployment environment (staging | prod)"
  type        = string
}

variable "project" {
  description = "Project slug for bucket naming"
  type        = string
  default     = "wallet-portal"
}

variable "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN — used to scope the bucket policy OAC condition"
  type        = string
  # Provided after cloudfront module is applied; empty during bootstrap
  default = ""
}

variable "log_lifecycle_ia_days" {
  description = "Days before transitioning logs to Standard-IA"
  type        = number
  default     = 30
}

variable "log_lifecycle_glacier_days" {
  description = "Days before transitioning logs to Glacier"
  type        = number
  default     = 90
}

variable "log_lifecycle_expire_days" {
  description = "Days before expiring log objects"
  type        = number
  default     = 365
}
