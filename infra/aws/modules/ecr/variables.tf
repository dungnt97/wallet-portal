variable "env" {
  description = "Deployment environment (staging | prod)"
  type        = string
}

variable "project" {
  description = "Project slug used as ECR namespace"
  type        = string
  default     = "wallet-portal"
}

variable "image_tag_mutability" {
  description = "ECR tag mutability: MUTABLE or IMMUTABLE"
  type        = string
  default     = "MUTABLE"
}

variable "untagged_expiry_days" {
  description = "Days after which untagged images are expired"
  type        = number
  default     = 7
}

variable "tagged_count_to_keep" {
  description = "Number of most recent tagged images to retain"
  type        = number
  default     = 10
}
