# ─────────────────────────────────────────────────────────────────
# ECS Service (reusable) — Fargate task definition + service +
# CloudWatch log group + security group + auto-scaling.
# Called 3× (admin-api, wallet-engine, policy-engine).
# Fargate Spot capacity provider used when use_fargate_spot = true.
# OTel sidecar wired when enable_otel = true (Phase 05).
# ─────────────────────────────────────────────────────────────────

locals {
  name_prefix = "wp-${var.env}"
  full_name   = "${local.name_prefix}-${var.service_name}"
  log_group   = "/ecs/${local.name_prefix}/${var.service_name}"

  # Build the OTel sidecar container definition when enabled.
  # Merged into container_definitions list alongside the app container.
  otel_sidecar = var.enable_otel ? [
    {
      name      = "otel-collector"
      image     = var.otel_collector_image
      essential = false

      cpu               = 128
      memoryReservation = 256

      portMappings = [
        { containerPort = 4317, protocol = "tcp", name = "otlp-grpc" },
        { containerPort = 4318, protocol = "tcp", name = "otlp-http" },
        { containerPort = 8888, protocol = "tcp", name = "self-metrics" },
        { containerPort = 13133, protocol = "tcp", name = "health-check" },
      ]

      # SSM config pulled by the collector at startup
      command = ["--config=ssm:/wp/${var.env}/otel/config"]

      environment = [
        { name = "DEPLOY_ENV", value = var.env },
        { name = "OTEL_SERVICE_NAMESPACE", value = "wallet-portal" },
      ]

      secrets = [
        {
          name      = "OTEL_EXPORTER_OTLP_ENDPOINT"
          valueFrom = var.otel_otlp_endpoint_secret_arn
        },
        {
          name      = "OTEL_EXPORTER_OTLP_HEADERS"
          valueFrom = var.otel_otlp_headers_secret_arn
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = local.log_group
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "otel-collector"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -sf http://localhost:13133/ || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ] : []
}

# ── CloudWatch Log Group ──────────────────────────────────────────
resource "aws_cloudwatch_log_group" "this" {
  name              = local.log_group
  retention_in_days = var.log_retention_days

  tags = {
    Service = var.service_name
  }
}

# ── Security Group ────────────────────────────────────────────────
resource "aws_security_group" "ecs_service" {
  name        = "${local.full_name}-sg"
  description = "ECS service SG for ${var.service_name} in ${var.env}"
  vpc_id      = var.vpc_id

  # Inbound from ALB on service port only
  ingress {
    description = "ALB → service port"
    from_port   = var.port
    to_port     = var.port
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }

  egress {
    description = "Allow all outbound (AWS APIs, RDS, Redis, ECR)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${local.full_name}-sg"
    Service = var.service_name
  }
}

# ── Task Definition ───────────────────────────────────────────────
resource "aws_ecs_task_definition" "this" {
  family                   = local.full_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = var.service_name
      image     = var.image_uri
      essential = true

      portMappings = [
        {
          containerPort = var.port
          protocol      = "tcp"
        }
      ]

      # Non-sensitive env vars
      environment = [
        for k, v in var.env_vars : { name = k, value = v }
      ]

      # Secrets Manager references — injected at container start
      secrets = [
        for k, arn in var.secret_arns : { name = k, valueFrom = arn }
      ]

      # Structured JSON logging to CloudWatch
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = local.log_group
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = var.service_name
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -sf http://localhost:${var.port}${var.health_check_path} || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ] + local.otel_sidecar)

  tags = {
    Service = var.service_name
  }
}

# ── ECS Service ───────────────────────────────────────────────────
resource "aws_ecs_service" "this" {
  name            = local.full_name
  cluster         = var.ecs_cluster_id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count

  # Fargate Spot for non-prod (cost saving); regular Fargate for prod
  dynamic "capacity_provider_strategy" {
    for_each = var.use_fargate_spot ? [1] : []
    content {
      capacity_provider = "FARGATE_SPOT"
      weight            = 2
      base              = 0
    }
  }

  dynamic "capacity_provider_strategy" {
    for_each = var.use_fargate_spot ? [1] : []
    content {
      capacity_provider = "FARGATE"
      weight            = 1
      base              = 1
    }
  }

  # When not using Spot, launch_type drives placement
  launch_type = var.use_fargate_spot ? null : "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.ecs_service.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = var.service_name
    container_port   = var.port
  }

  # Allow rolling updates without downtime
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  # Wait for steady state during apply (useful for CI plan checks)
  wait_for_steady_state = false

  # Ignore image URI changes — managed by push-images.sh + deploy pipeline
  lifecycle {
    ignore_changes = [task_definition]
  }

  tags = {
    Service = var.service_name
  }

  depends_on = [aws_cloudwatch_log_group.this]
}

# ── Auto-scaling ──────────────────────────────────────────────────
resource "aws_appautoscaling_target" "this" {
  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${split("/", var.ecs_cluster_id)[1]}/${aws_ecs_service.this.name}"
  min_capacity       = var.autoscaling_min
  max_capacity       = var.autoscaling_max
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.full_name}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this.service_namespace
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension
  resource_id        = aws_appautoscaling_target.this.resource_id

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = var.autoscaling_cpu_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
