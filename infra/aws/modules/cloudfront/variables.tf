variable "env" {
  description = "Deployment environment (staging | prod)"
  type        = string
}

variable "project" {
  description = "Project slug for resource naming"
  type        = string
  default     = "wallet-portal"
}

variable "domain_name" {
  description = "Primary domain alias for the distribution (e.g. wallet-portal.example.com)"
  type        = string
}

variable "s3_bucket_regional_domain" {
  description = "S3 UI bucket regional domain name (for OAC origin)"
  type        = string
}

variable "s3_bucket_id" {
  description = "S3 UI bucket ID (name)"
  type        = string
}

variable "alb_dns_name" {
  description = "ALB DNS name for API origin (/api/*, /wallet/*, /policy/*)"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN — MUST be in us-east-1 for CloudFront"
  type        = string
}

variable "logs_bucket_id" {
  description = "S3 logging bucket name for CloudFront access logs"
  type        = string
  default     = ""
}

variable "enable_waf" {
  description = "Associate AWS-managed WAF core rule set"
  type        = bool
  default     = true
}

variable "web_acl_arn" {
  description = "WAF WebACL ARN (us-east-1). Created outside this module; provide ARN here."
  type        = string
  default     = ""
}

variable "price_class" {
  description = "CloudFront price class (PriceClass_100 = US+EU only)"
  type        = string
  default     = "PriceClass_100"
}

variable "default_ttl" {
  description = "Default cache TTL in seconds for static assets"
  type        = number
  default     = 86400
}

variable "max_ttl" {
  description = "Maximum cache TTL in seconds for static assets"
  type        = number
  default     = 31536000
}
