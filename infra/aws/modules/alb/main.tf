# ─────────────────────────────────────────────────────────────────
# ALB — external Application Load Balancer in public subnets.
# HTTPS 443 with ACM cert; HTTP 80 → 443 redirect.
# 3 target groups with path-based routing:
#   /api/*       → admin-api   (port 3000)
#   /wallet/*    → wallet-engine (port 3001)
#   /policy/*    → policy-engine (port 3002)
#   default      → admin-api (catch-all)
# ─────────────────────────────────────────────────────────────────

locals {
  name_prefix = "wp-${var.env}"
}

# ── Security Group — ALB ──────────────────────────────────────────
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Allow inbound HTTP/HTTPS from internet to ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound to ECS targets"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-alb-sg"
  }
}

# ── Application Load Balancer ─────────────────────────────────────
resource "aws_lb" "this" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.env == "prod"

  dynamic "access_logs" {
    for_each = var.enable_access_logs ? [1] : []
    content {
      bucket  = var.access_logs_bucket
      prefix  = "${local.name_prefix}-alb"
      enabled = true
    }
  }

  tags = {
    Name = "${local.name_prefix}-alb"
  }
}

# ── Target Groups ─────────────────────────────────────────────────
resource "aws_lb_target_group" "admin_api" {
  name                 = "${local.name_prefix}-admin-api-tg"
  port                 = 3000
  protocol             = "HTTP"
  vpc_id               = var.vpc_id
  target_type          = "ip"
  deregistration_delay = var.deregistration_delay

  health_check {
    path                = var.health_check_path
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200"
  }

  tags = { Service = "admin-api" }
}

resource "aws_lb_target_group" "wallet_engine" {
  name                 = "${local.name_prefix}-wallet-engine-tg"
  port                 = 3001
  protocol             = "HTTP"
  vpc_id               = var.vpc_id
  target_type          = "ip"
  deregistration_delay = var.deregistration_delay

  health_check {
    path                = var.health_check_path
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200"
  }

  tags = { Service = "wallet-engine" }
}

resource "aws_lb_target_group" "policy_engine" {
  name                 = "${local.name_prefix}-policy-engine-tg"
  port                 = 3002
  protocol             = "HTTP"
  vpc_id               = var.vpc_id
  target_type          = "ip"
  deregistration_delay = var.deregistration_delay

  health_check {
    path                = var.health_check_path
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200"
  }

  tags = { Service = "policy-engine" }
}

# ── HTTP → HTTPS redirect listener ───────────────────────────────
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ── HTTPS listener with path-based routing ────────────────────────
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  # Default: route to admin-api
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.admin_api.arn
  }
}

# /api/* → admin-api
resource "aws_lb_listener_rule" "admin_api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.admin_api.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}

# /wallet/* → wallet-engine
resource "aws_lb_listener_rule" "wallet_engine" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.wallet_engine.arn
  }

  condition {
    path_pattern {
      values = ["/wallet/*"]
    }
  }
}

# /policy/* → policy-engine
resource "aws_lb_listener_rule" "policy_engine" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 30

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.policy_engine.arn
  }

  condition {
    path_pattern {
      values = ["/policy/*"]
    }
  }
}
