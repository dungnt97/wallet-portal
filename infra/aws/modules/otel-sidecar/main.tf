# ─────────────────────────────────────────────────────────────────
# OTel sidecar module — produces a container definition map for the
# OpenTelemetry Collector contrib image.
#
# Usage: merge output.container_definition into the parent task's
# container_definitions jsonencode([...]) list.
#
# The collector config YAML is read from SSM Parameter Store at
# container start via --config=ssm://${env}/otel/config so no
# volume mounts are needed in Fargate.
# ─────────────────────────────────────────────────────────────────

locals {
  deploy_env = var.env
}

# SSM parameter data source — resolves the ARN to the parameter name
# used in the collector --config argument.
data "aws_ssm_parameter" "otel_config" {
  name            = "/wp/${local.deploy_env}/otel/config"
  with_decryption = false
}

output "container_definition" {
  description = "OTel sidecar container definition map — merge into task container_definitions list"
  value = {
    name      = "otel-collector"
    image     = var.image
    essential = false

    # Reserve a slice of the task CPU/memory for the collector
    cpu               = var.cpu
    memoryReservation = var.memory_mib

    # Ports are localhost-only within the Fargate awsvpc task network;
    # they do not need to be published externally.
    portMappings = [
      { containerPort = 4317, protocol = "tcp", name = "otlp-grpc" },
      { containerPort = 4318, protocol = "tcp", name = "otlp-http" },
      { containerPort = 8888, protocol = "tcp", name = "self-metrics" },
      { containerPort = 13133, protocol = "tcp", name = "health-check" },
    ]

    # Pull collector config from SSM Parameter Store at startup.
    # The SSM config extension (--config=ssm:...) is built into contrib image.
    command = [
      "--config=ssm:/wp/${local.deploy_env}/otel/config",
    ]

    # Non-secret runtime env vars
    environment = [
      { name = "DEPLOY_ENV", value = local.deploy_env },
      { name = "OTEL_SERVICE_NAMESPACE", value = "wallet-portal" },
    ]

    # Grafana Cloud credentials injected from Secrets Manager at container start
    secrets = [
      {
        name      = "OTEL_EXPORTER_OTLP_ENDPOINT"
        valueFrom = var.otlp_endpoint_secret_arn
      },
      {
        name      = "OTEL_EXPORTER_OTLP_HEADERS"
        valueFrom = var.otlp_headers_secret_arn
      },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = var.log_group
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "otel-collector"
      }
    }

    # Health-check against the collector health_check extension endpoint
    healthCheck = {
      command     = ["CMD-SHELL", "curl -sf http://localhost:13133/ || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }
}
