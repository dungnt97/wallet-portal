#!/usr/bin/env bash
# dev-up.sh — start the full local wallet-portal development stack.
# Usage: ./scripts/dev-up.sh [--infra-only]
#
# Steps:
#   1. Ensure infra/.env.compose exists (copy from .example if not)
#   2. Start Docker Compose services (postgres, redis, otel-collector-base)
#   3. Wait until postgres and redis report healthy
#   4. Run DB migrations via pnpm db:migrate
#   5. Start all services via turbo run dev (unless --infra-only)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_ROOT/infra"
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"
ENV_FILE="$INFRA_DIR/.env.compose"
ENV_EXAMPLE="$INFRA_DIR/.env.compose.example"

INFRA_ONLY=false
for arg in "$@"; do
  if [[ "$arg" == "--infra-only" ]]; then
    INFRA_ONLY=true
  fi
done

# ── Ensure .env.compose exists ───────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[dev-up] .env.compose not found — copying from .env.compose.example"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "[dev-up] IMPORTANT: Edit $ENV_FILE before continuing if you need real secrets"
fi

# ── Start infrastructure services ────────────────────────────────────────────
echo "[dev-up] Starting postgres, redis, otel-collector-base..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis otel-collector-base

# ── Wait for postgres healthy ─────────────────────────────────────────────────
echo "[dev-up] Waiting for postgres to be healthy..."
for i in $(seq 1 30); do
  STATUS=$(docker compose -f "$COMPOSE_FILE" ps --format json postgres 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health',''))" 2>/dev/null || echo "")
  if [[ "$STATUS" == "healthy" ]]; then
    echo "[dev-up] postgres healthy"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "[dev-up] ERROR: postgres did not become healthy in time"
    exit 1
  fi
  sleep 2
done

# ── Wait for redis healthy ────────────────────────────────────────────────────
echo "[dev-up] Waiting for redis to be healthy..."
for i in $(seq 1 20); do
  STATUS=$(docker compose -f "$COMPOSE_FILE" ps --format json redis 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health',''))" 2>/dev/null || echo "")
  if [[ "$STATUS" == "healthy" ]]; then
    echo "[dev-up] redis healthy"
    break
  fi
  if [[ $i -eq 20 ]]; then
    echo "[dev-up] ERROR: redis did not become healthy in time"
    exit 1
  fi
  sleep 2
done

# ── Run migrations ────────────────────────────────────────────────────────────
# Run from host: db:migrate loads DATABASE_URL via dotenv from apps/admin-api/.env
# (which uses localhost:5433 — the host-mapped port). The compose env file's
# DATABASE_URL points to the docker-internal hostname `postgres` and is not
# resolvable from the host.
echo "[dev-up] Running DB migrations..."
(
  cd "$REPO_ROOT"
  pnpm --filter @wp/admin-api db:migrate
)
echo "[dev-up] Migrations complete"

# ── Seed dev fixtures ─────────────────────────────────────────────────────────
# Idempotent — staff/wallets seeders skip duplicates. Required for the UI's
# demo-account dev-login flow (POST /auth/session/dev-login lookups staff by email).
echo "[dev-up] Seeding dev fixtures..."
(
  cd "$REPO_ROOT"
  pnpm --filter @wp/admin-api db:seed
)
echo "[dev-up] Seed complete"

# ── Start all services ────────────────────────────────────────────────────────
if [[ "$INFRA_ONLY" == "false" ]]; then
  echo "[dev-up] Starting all services via turbo run dev..."
  cd "$REPO_ROOT"
  exec pnpm turbo run dev
else
  echo "[dev-up] --infra-only: skipping service start"
  echo "[dev-up] Infra services running. Start apps manually with: pnpm turbo run dev"
fi
