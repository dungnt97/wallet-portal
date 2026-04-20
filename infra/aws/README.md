# AWS Infrastructure — IaC Placeholder

> **Status: Post-MVP** — No Terraform code exists yet. This directory will be populated after MVP launch.

## Intended Structure

```
infra/aws/
├── main.tf                    # Root module: wires sub-modules together
├── variables.tf               # Input variables (region, env, account ID, etc.)
├── outputs.tf                 # Outputs: ALB DNS, ECR repo URLs, etc.
├── terraform.tf               # Provider + backend config (S3 state, DynamoDB lock)
├── modules/
│   ├── vpc/                   # VPC, subnets (public/private/data), NAT gateway, route tables
│   ├── ecs/                   # ECS cluster, task definitions, services, auto-scaling
│   ├── rds/                   # RDS PostgreSQL 16 (Multi-AZ), parameter group, subnet group
│   ├── elasticache/           # Redis 7 cluster mode disabled, subnet group, SG
│   ├── alb/                   # Application Load Balancer, target groups, listener rules
│   ├── cloudfront/            # CloudFront distribution for UI static assets
│   ├── s3/                    # Static asset bucket, logging bucket
│   ├── secrets-manager/       # Secrets for DB creds, JWT secret, API keys
│   └── iam/                   # Task execution roles, deployment roles, boundary policies
└── envs/
    ├── staging/               # staging.tfvars
    └── prod/                  # prod.tfvars
```

## Services Mapped to AWS

| Service | AWS Resource |
|---|---|
| admin-api | ECS Fargate service behind ALB |
| wallet-engine | ECS Fargate service behind ALB (internal) |
| policy-engine | ECS Fargate service behind ALB (internal) |
| ui | CloudFront + S3 static hosting |
| PostgreSQL | RDS PostgreSQL 16 Multi-AZ |
| Redis | ElastiCache Redis 7 (cluster-off) |
| Container images | ECR (one repo per service) |
| Secrets | Secrets Manager (injected as env vars via ECS task def) |

## Rough Cost Estimate (staging)

| Resource | Monthly (USD, approx) |
|---|---|
| ECS Fargate (4 services, 0.25 vCPU / 0.5 GB each) | ~ |
| RDS db.t3.micro (PostgreSQL 16) | ~ |
| ElastiCache cache.t3.micro | ~ |
| ALB | ~ |
| CloudFront (low traffic) | ~ |
| ECR storage | ~ |
| **Total staging** | **~/month** |

Production costs scale with traffic; estimate 3-5x for prod with Multi-AZ RDS and larger Fargate tasks.

## Timeline

ETA: Post-MVP (after product-market fit validated on staging)

## Prerequisites Before Enabling

1. AWS account with billing alarm configured
2. Terraform state S3 bucket + DynamoDB lock table created manually
3. Route53 hosted zone for domain
4. ACM certificate issued
5. GitHub Actions secrets configured:
   - 
   -  /  (or OIDC role)
6. Uncomment ECR push steps in 
