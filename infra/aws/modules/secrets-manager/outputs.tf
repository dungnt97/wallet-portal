output "db_password" {
  description = "Generated DB password (sensitive)"
  value       = random_password.db_password.result
  sensitive   = true
}

output "secret_arns" {
  description = "Map of secret name to ARN — pass to IAM and ECS task defs"
  value = {
    db_password           = aws_secretsmanager_secret.db_password.arn
    jwt_secret            = aws_secretsmanager_secret.jwt_secret.arn
    hd_master_seed        = aws_secretsmanager_secret.hd_master_seed.arn
    webauthn_rpid         = aws_secretsmanager_secret.webauthn_rpid.arn
    internal_bearer_token = aws_secretsmanager_secret.internal_bearer_token.arn
    session_secret        = aws_secretsmanager_secret.session_secret.arn
  }
}

output "secrets_read_policy_json" {
  description = "IAM policy JSON granting GetSecretValue on all managed secrets"
  value       = data.aws_iam_policy_document.secrets_read.json
}
