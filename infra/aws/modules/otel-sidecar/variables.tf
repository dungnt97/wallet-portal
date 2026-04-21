# ─────────────────────────────────────────────────────────────────
# OTel sidecar module variables
# Produces a container_definitions JSON snippet for the OTel contrib
# collector image to be merged into an ECS task definition.
# ─────────────────────────────────────────────────────────────────

variable "env" {
  description = "Deployment environment (staging | prod)"
  type        = string
}

variable "log_group" {
  description = "CloudWatch log group name for sidecar logs"
  type        = string
}

variable "aws_region" {
  description = "AWS region for CloudWatch log driver"
  type        = string
  default     = "ap-southeast-1"
}

variable "config_ssm_arn" {
  description = "ARN of the SSM Parameter containing the OTel collector YAML config"
  type        = string
}

variable "otlp_endpoint_secret_arn" {
  description = "ARN of Secrets Manager secret holding OTEL_EXPORTER_OTLP_ENDPOINT"
  type        = string
}

variable "otlp_headers_secret_arn" {
  description = "ARN of Secrets Manager secret holding OTEL_EXPORTER_OTLP_HEADERS (e.g. Authorization=Basic <token>)"
  type        = string
}

variable "image" {
  description = "OTel collector contrib image URI"
  type        = string
  default     = "otel/opentelemetry-collector-contrib:0.104.0"
}

variable "cpu" {
  description = "CPU units for the sidecar container (shares task CPU budget)"
  type        = number
  default     = 128
}

variable "memory_mib" {
  description = "Memory reservation in MiB for the sidecar"
  type        = number
  default     = 256
}
