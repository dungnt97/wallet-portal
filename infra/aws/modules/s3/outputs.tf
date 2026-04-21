output "ui_bucket_id" {
  description = "UI S3 bucket name (ID)"
  value       = aws_s3_bucket.ui.id
}

output "ui_bucket_arn" {
  description = "UI S3 bucket ARN"
  value       = aws_s3_bucket.ui.arn
}

output "ui_bucket_regional_domain" {
  description = "UI S3 bucket regional domain name (for CloudFront OAC origin)"
  value       = aws_s3_bucket.ui.bucket_regional_domain_name
}

output "logs_bucket_id" {
  description = "Logging S3 bucket name"
  value       = aws_s3_bucket.logs.id
}

output "logs_bucket_arn" {
  description = "Logging S3 bucket ARN"
  value       = aws_s3_bucket.logs.arn
}
