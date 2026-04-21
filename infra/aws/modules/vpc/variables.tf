variable "env" {
  description = "Deployment environment (staging | prod)"
  type        = string
  validation {
    condition     = contains(["staging", "prod"], var.env)
    error_message = "env must be 'staging' or 'prod'."
  }
}

variable "cidr_block" {
  description = "Root CIDR for the VPC (e.g. 10.10.0.0/16)"
  type        = string
}

variable "availability_zones" {
  description = "List of exactly 2 AZs in which to create subnets"
  type        = list(string)
  validation {
    condition     = length(var.availability_zones) == 2
    error_message = "Exactly 2 availability zones must be specified."
  }
}

variable "project" {
  description = "Project tag value"
  type        = string
  default     = "wallet-portal"
}
