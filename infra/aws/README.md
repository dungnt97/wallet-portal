# Wallet Portal — AWS Infrastructure (Terraform)

Terraform IaC for the wallet-portal stack. Covers VPC, data tier (RDS + Redis + Secrets), compute tier (ECR + ECS + ALB), and edge (CloudFront + S3 + Route53 + ACM) across `staging` and `prod` environments in `us-east-1`.

## Directory layout

```
infra/aws/
├── modules/
│   ├── bootstrap/        # S3 state bucket + DynamoDB lock (run once)
│   ├── vpc/              # VPC, subnets, IGW, NAT, route tables
│   ├── rds/              # RDS Postgres 16
│   ├── elasticache/      # ElastiCache Redis 7
│   ├── secrets-manager/  # Secrets Manager entries + IAM policies
│   ├── iam/              # ECS task-execution + per-service task roles
│   ├── ecr/              # ECR repos (admin-api, wallet-engine, policy-engine)
│   ├── ecs-service/      # Reusable ECS Fargate service module
│   ├── alb/              # Application Load Balancer + target groups
│   ├── s3/               # UI static bucket + logging bucket
│   ├── cloudfront/       # CloudFront distribution
│   ├── acm/              # ACM certs (us-east-1 for CF, regional for ALB)
│   └── route53/          # Route53 aliases
├── envs/
│   ├── staging/          # Staging env root (backend.tf, main.tf, variables.tf, outputs.tf, main.tfvars)
│   └── prod/             # Prod env root
├── scripts/
│   ├── push-images.sh    # Build + push Docker images to ECR
│   └── deploy-ui.sh      # Build UI + sync to S3 + CF invalidation
└── README.md
```

## Prerequisites

1. **AWS CLI** configured: `aws configure` (or assume an IAM role via `AWS_PROFILE`).
2. **Terraform >= 1.6**: `brew install terraform` or [tfenv](https://github.com/tfutils/tfenv).
3. **IAM permissions**: the deploying identity needs broad permissions for first bootstrap; after that, scope to a deploy role.

---

## Step 0 — Bootstrap state backend (once per env)

The S3 state bucket and DynamoDB lock table must exist *before* running `terraform init` in an env directory (chicken-and-egg). Bootstrap them using the local-backend bootstrap module:

```bash
cd infra/aws/modules/bootstrap

terraform init

# Staging
terraform apply -var="env=staging" -var="aws_region=us-east-1"

# Prod
terraform apply -var="env=prod" -var="aws_region=us-east-1"
```

This creates:
- S3 bucket `wallet-portal-tfstate-{env}` (versioned, AES-256 encrypted, no public access)
- DynamoDB table `wallet-portal-tf-lock-{env}` (PAY_PER_REQUEST, LockID hash key)

Both resources have `prevent_destroy = true`. To destroy them you must remove that lifecycle block first.

---

## Step 1 — Init + validate each env

```bash
# Staging
cd infra/aws/envs/staging
terraform init
terraform validate
terraform fmt -check -recursive ../../

# Prod
cd infra/aws/envs/prod
terraform init
terraform validate
```

---

## Step 2 — Plan (no apply in CI)

```bash
# Staging
cd infra/aws/envs/staging
terraform plan -var-file=main.tfvars

# Prod
cd infra/aws/envs/prod
terraform plan -var-file=main.tfvars
```

Plans are non-destructive until `terraform apply` is explicitly run. **Never apply from CI** — apply manually from a secured workstation with MFA.

---

## Step 3 — Apply (manual, gated)

```bash
cd infra/aws/envs/staging
terraform apply -var-file=main.tfvars

cd infra/aws/envs/prod
terraform apply -var-file=main.tfvars
```

---

## Supplying secrets at apply time

Secret *values* are **not** stored in `.tfvars` or Terraform state. The `secrets-manager` module creates the secret resources with placeholder values. After apply, populate real values:

```bash
# Example: set DB password
aws secretsmanager put-secret-value \
  --secret-id "wallet-portal/staging/db_password" \
  --secret-string "$(openssl rand -base64 32)"

# HD master seed — dual-control: requires 2 admins present
aws secretsmanager put-secret-value \
  --secret-id "wallet-portal/staging/hd_master_seed" \
  --secret-string "$HD_MASTER_SEED"
```

See `docs/runbooks/secrets-rotation.md` for per-secret rotation procedures.

---

## Updating the domain

The placeholder domain `wallet-portal.example.com` must be replaced with a real domain before applying Phase 04 (edge). Update `main.tfvars` in both envs:

```hcl
# envs/staging/main.tfvars
domain_name = "staging.yourdomain.com"

# envs/prod/main.tfvars
domain_name = "yourdomain.com"
```

A Route53 hosted zone for the domain must exist in the same AWS account before `terraform apply` runs the `route53` module.

---

## Deploying images (Phase 03)

```bash
# After ECR repos are created:
./scripts/push-images.sh staging $(git rev-parse --short HEAD)
```

---

## Deploying UI (Phase 04)

```bash
./scripts/deploy-ui.sh staging
```

---

## Destroying an environment

```bash
# Edge first, then compute, data, vpc (reverse dependency order)
cd infra/aws/envs/staging
terraform destroy -var-file=main.tfvars -target=module.route53
terraform destroy -var-file=main.tfvars -target=module.cloudfront
terraform destroy -var-file=main.tfvars -target=module.s3_ui
terraform destroy -var-file=main.tfvars -target=module.alb
terraform destroy -var-file=main.tfvars -target=module.ecs_admin_api
terraform destroy -var-file=main.tfvars -target=module.ecs_wallet_engine
terraform destroy -var-file=main.tfvars -target=module.ecs_policy_engine
terraform destroy -var-file=main.tfvars -target=module.rds
terraform destroy -var-file=main.tfvars -target=module.redis
terraform destroy -var-file=main.tfvars -target=module.vpc
```

Prod RDS has `deletion_protection = true` — toggle it off manually before destroy:
```bash
aws rds modify-db-instance \
  --db-instance-identifier wp-prod-postgres \
  --no-deletion-protection \
  --apply-immediately
```

---

## State recovery

If state is corrupted, restore from S3 versioning:

```bash
# List state versions
aws s3api list-object-versions \
  --bucket wallet-portal-tfstate-staging \
  --prefix staging/terraform.tfstate

# Restore a prior version
aws s3api get-object \
  --bucket wallet-portal-tfstate-staging \
  --key staging/terraform.tfstate \
  --version-id <VERSION_ID> \
  terraform.tfstate.restore
```

---

## Security notes

- Terraform state is encrypted at rest (AES-256) and in transit (TLS).
- State access restricted to the IAM deploy role — no wildcard `s3:*`.
- Secret *values* never appear in `.tfvars`, plan output, or state. Use `terraform output -raw` with care.
- `tfsec` and `checkov` run in CI against `infra/aws/` — zero HIGH findings required to merge.
