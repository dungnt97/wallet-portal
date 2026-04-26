#!/usr/bin/env bash
# dev-status.sh — health-check the local wallet-portal stack.
# Usage: ./scripts/dev-status.sh
#
# Reports docker compose service state plus per-app HTTP probes.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/docker-compose.yml"

probe() {
  local name="$1" url="$2"
  local code
  code=$(curl -sS -o /dev/null -m 2 -w '%{http_code}' "$url" 2>/dev/null || echo "---")
  if [[ "$code" == "200" || "$code" == "204" ]]; then
    printf "  \033[32m✓\033[0m %-15s %s  (%s)\n" "$name" "$url" "$code"
  else
    printf "  \033[31m✗\033[0m %-15s %s  (%s)\n" "$name" "$url" "$code"
  fi
}

echo "── Infra (docker compose) ────────────────────────────────────────────"
docker compose -f "$COMPOSE_FILE" ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null \
  || echo "  (compose stack is down — run ./scripts/dev-up.sh)"

echo
echo "── App health probes ─────────────────────────────────────────────────"
probe "admin-api"     "http://localhost:3001/health/live"
probe "admin-api-db"  "http://localhost:3001/health/ready"
probe "wallet-engine" "http://localhost:3002/health"
probe "policy-engine" "http://localhost:3003/health/live"
probe "policy-db"     "http://localhost:3003/health/ready"
probe "ui"            "http://localhost:5173/"
echo
