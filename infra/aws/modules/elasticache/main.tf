# ─────────────────────────────────────────────────────────────────
# ElastiCache — Redis 7, in-transit encryption, subnet group in
# private subnets, SG allowing only ECS tasks on 6379.
# num_cache_nodes=1 → single node (staging)
# num_cache_nodes=2 → replication group with 1 replica (prod)
# ─────────────────────────────────────────────────────────────────

locals {
  name_prefix  = "wp-${var.env}"
  is_clustered = var.num_cache_nodes > 1
}

# ── Security Group ────────────────────────────────────────────────
resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis-sg"
  description = "Allow inbound Redis 6379 from ECS tasks only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.ecs_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-redis-sg"
  }
}

# ── Subnet Group ──────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "this" {
  name        = "${local.name_prefix}-redis-subnet-group"
  description = "Private subnets for ElastiCache Redis"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Name = "${local.name_prefix}-redis-subnet-group"
  }
}

# ── Parameter Group ───────────────────────────────────────────────
resource "aws_elasticache_parameter_group" "redis7" {
  name        = "${local.name_prefix}-redis7-params"
  family      = "redis7"
  description = "Wallet Portal Redis 7 parameter group"

  tags = {
    Name = "${local.name_prefix}-redis7-params"
  }
}

# ── Replication Group (handles both single-node and multi-node) ───
# aws_elasticache_replication_group works for both 1-node and N-node
# configurations; it is the recommended resource for Redis on AWS.
resource "aws_elasticache_replication_group" "this" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "Wallet Portal Redis ${var.env}"

  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_nodes
  parameter_group_name = aws_elasticache_parameter_group.redis7.name
  subnet_group_name    = aws_elasticache_subnet_group.this.name
  security_group_ids   = [aws_security_group.redis.id]

  # In-transit encryption — required for prod, enabled everywhere
  transit_encryption_enabled = true
  # At-rest encryption
  at_rest_encryption_enabled = true

  # Automatic failover only available with >= 2 nodes
  automatic_failover_enabled = local.is_clustered
  multi_az_enabled           = local.is_clustered

  # Maintenance + snapshot
  maintenance_window       = "sun:05:00-sun:06:00"
  snapshot_window          = "04:00-05:00"
  snapshot_retention_limit = 3

  apply_immediately = var.env != "prod"

  tags = {
    Name = "${local.name_prefix}-redis"
  }
}
