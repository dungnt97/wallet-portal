variable "env" {
  description = "Deployment environment (staging | prod)"
  type        = string
}

variable "domain_name" {
  description = "Primary domain for the certificate (e.g. wallet-portal.example.com)"
  type        = string
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for DNS validation CNAME records"
  type        = string
}

variable "subject_alternative_names" {
  description = "Additional SANs for the certificate (e.g. www.domain, api.domain)"
  type        = list(string)
  default     = []
}
