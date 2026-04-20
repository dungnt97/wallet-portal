#!/usr/bin/env bash
# dev-down.sh — stop the local wallet-portal development stack and remove volumes.
# Usage: ./scripts/dev-down.sh
#
# WARNING: -v removes named volumes (wp_pg_data, wp_redis_data).
# All local Postgres data will be lost. Run db:migrate again after dev-up.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/docker-compose.yml"

echo "[dev-down] Stopping all compose services and removing volumes..."
docker compose -f "$COMPOSE_FILE" down -v --remove-orphans

echo "[dev-down] Done. Run ./scripts/dev-up.sh to restart."
