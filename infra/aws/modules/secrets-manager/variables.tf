variable "env" {
  description = "Deployment environment (staging | prod)"
  type        = string
}

variable "project" {
  description = "Project slug for secret path namespacing"
  type        = string
  default     = "wallet-portal"
}

variable "recovery_window_days" {
  description = "Days before a deleted secret is permanently removed (0 = immediate)"
  type        = number
  default     = 7
}
