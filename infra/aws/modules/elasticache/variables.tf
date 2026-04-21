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
  description = "Private subnet IDs for the cache subnet group"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group ID of ECS tasks — granted inbound 6379 access"
  type        = string
}

variable "node_type" {
  description = "ElastiCache node type (e.g. cache.t4g.micro)"
  type        = string
  default     = "cache.t4g.micro"
}

variable "num_cache_nodes" {
  description = "Number of cache nodes (1 = staging, 2 = prod replication group)"
  type        = number
  default     = 1
}

variable "redis_engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.1"
}
