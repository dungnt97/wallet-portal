terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project = var.project
      Env     = var.env
    }
  }
}

# ── Phase 01: VPC ─────────────────────────────────────────────────
module "vpc" {
  source = "../../modules/vpc"

  env                = var.env
  cidr_block         = var.vpc_cidr
  availability_zones = var.availability_zones
  project            = var.project
}

# ── Phase 02: Data tier ───────────────────────────────────────────
# Uncomment after Phase 02 modules are complete.
#
# module "secrets" {
#   source = "../../modules/secrets-manager"
#   env    = var.env
# }
#
# module "iam" {
#   source          = "../../modules/iam"
#   env             = var.env
#   secret_arns     = module.secrets.secret_arns
# }
#
# module "rds" {
#   source             = "../../modules/rds"
#   env                = var.env
#   instance_class     = var.db_instance_class
#   multi_az           = var.db_multi_az
#   private_subnet_ids = module.vpc.private_subnet_ids
#   vpc_id             = module.vpc.vpc_id
#   db_password        = module.secrets.db_password
# }
#
# module "redis" {
#   source             = "../../modules/elasticache"
#   env                = var.env
#   node_type          = var.redis_node_type
#   private_subnet_ids = module.vpc.private_subnet_ids
#   vpc_id             = module.vpc.vpc_id
# }

# ── Phase 03: Compute tier ────────────────────────────────────────
# Uncomment after Phase 03 modules are complete.
#
# resource "aws_ecs_cluster" "main" {
#   name = "wp-${var.env}"
#   setting {
#     name  = "containerInsights"
#     value = "enabled"
#   }
# }
#
# module "ecr" {
#   source  = "../../modules/ecr"
#   env     = var.env
#   project = var.project
# }
#
# module "alb" {
#   source            = "../../modules/alb"
#   env               = var.env
#   vpc_id            = module.vpc.vpc_id
#   public_subnet_ids = module.vpc.public_subnet_ids
#   domain_name       = var.domain_name
# }
#
# module "ecs_admin_api" {
#   source            = "../../modules/ecs-service"
#   service_name      = "admin-api"
#   env               = var.env
#   image_uri         = "${module.ecr.admin_api_repo_url}:latest"
#   cpu               = 2048
#   memory            = 4096
#   port              = 3000
#   subnet_ids        = module.vpc.private_subnet_ids
#   vpc_id            = module.vpc.vpc_id
#   target_group_arn  = module.alb.admin_api_target_group_arn
#   secret_arns       = module.secrets.secret_arns
#   desired_count     = 1
# }
#
# module "ecs_wallet_engine" {
#   source            = "../../modules/ecs-service"
#   service_name      = "wallet-engine"
#   env               = var.env
#   image_uri         = "${module.ecr.wallet_engine_repo_url}:latest"
#   cpu               = 1024
#   memory            = 2048
#   port              = 3001
#   subnet_ids        = module.vpc.private_subnet_ids
#   vpc_id            = module.vpc.vpc_id
#   target_group_arn  = module.alb.wallet_engine_target_group_arn
#   secret_arns       = module.secrets.secret_arns
#   desired_count     = 1
# }
#
# module "ecs_policy_engine" {
#   source            = "../../modules/ecs-service"
#   service_name      = "policy-engine"
#   env               = var.env
#   image_uri         = "${module.ecr.policy_engine_repo_url}:latest"
#   cpu               = 1024
#   memory            = 2048
#   port              = 3002
#   subnet_ids        = module.vpc.private_subnet_ids
#   vpc_id            = module.vpc.vpc_id
#   target_group_arn  = module.alb.policy_engine_target_group_arn
#   secret_arns       = module.secrets.secret_arns
#   desired_count     = 1
# }

# ── Phase 04: Edge ────────────────────────────────────────────────
# Uncomment after Phase 04 modules are complete.
#
# module "s3_ui" {
#   source  = "../../modules/s3"
#   env     = var.env
#   project = var.project
# }
#
# module "acm" {
#   source      = "../../modules/acm"
#   env         = var.env
#   domain_name = var.domain_name
# }
#
# module "cloudfront" {
#   source               = "../../modules/cloudfront"
#   env                  = var.env
#   s3_bucket_id         = module.s3_ui.bucket_id
#   s3_bucket_arn        = module.s3_ui.bucket_arn
#   alb_dns_name         = module.alb.alb_dns_name
#   acm_certificate_arn  = module.acm.cloudfront_cert_arn
#   domain_name          = var.domain_name
# }
#
# module "route53" {
#   source                   = "../../modules/route53"
#   env                      = var.env
#   domain_name              = var.domain_name
#   cloudfront_domain_name   = module.cloudfront.domain_name
#   cloudfront_hosted_zone_id = module.cloudfront.hosted_zone_id
#   alb_dns_name             = module.alb.alb_dns_name
#   alb_hosted_zone_id       = module.alb.alb_hosted_zone_id
# }
