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
  description = "VPC ID for security group placement"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group ID of ECS tasks — granted inbound 5432 access"
  type        = string
}

variable "instance_class" {
  description = "RDS instance class (e.g. db.t4g.micro)"
  type        = string
}

variable "multi_az" {
  description = "Enable Multi-AZ standby"
  type        = bool
  default     = false
}

variable "db_name" {
  description = "Initial database name"
  type        = string
  default     = "walletportal"
}

variable "db_username" {
  description = "Master DB username"
  type        = string
  default     = "wpadmin"
}

variable "db_password" {
  description = "Master DB password — sourced from Secrets Manager, not stored in state"
  type        = string
  sensitive   = true
}

variable "allocated_storage_gb" {
  description = "Initial allocated storage in GiB"
  type        = number
  default     = 20
}

variable "deletion_protection" {
  description = "Prevent accidental deletion. Always true in prod."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Automated backup retention window in days"
  type        = number
  default     = 7
}
