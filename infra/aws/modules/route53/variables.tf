variable "env" {
  description = "Deployment environment (staging | prod)"
  type        = string
}

variable "domain_name" {
  description = "Base domain (e.g. wallet-portal.example.com). Hosted zone must already exist."
  type        = string
}

variable "cloudfront_domain_name" {
  description = "CloudFront distribution domain name (e.g. d1234.cloudfront.net)"
  type        = string
}

variable "cloudfront_hosted_zone_id" {
  description = "CloudFront canonical hosted zone ID (always Z2FDTNDATAQYW2 for CloudFront)"
  type        = string
  default     = "Z2FDTNDATAQYW2"
}

variable "alb_dns_name" {
  description = "External ALB DNS name for the api subdomain alias"
  type        = string
}

variable "alb_hosted_zone_id" {
  description = "ALB canonical hosted zone ID"
  type        = string
}
