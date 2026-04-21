variable "env" {
  description = "Deployment environment"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "Root CIDR block for the VPC"
  type        = string
}

variable "availability_zones" {
  description = "List of 2 AZs to use"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "project" {
  description = "Project tag"
  type        = string
  default     = "wallet-portal"
}

# ── Data tier (Phase 02 stubs — set by data.tfvars) ───────────────
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.small"
}

variable "db_multi_az" {
  description = "Enable RDS Multi-AZ"
  type        = bool
  default     = true
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.micro"
}

# ── Compute tier (Phase 03 stubs — set by compute.tfvars) ─────────
variable "domain_name" {
  description = "Base domain for ACM + Route53 (e.g. wallet-portal.example.com)"
  type        = string
  default     = "wallet-portal.example.com"
}
