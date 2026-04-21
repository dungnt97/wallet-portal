#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# push-images.sh — Build, tag, and push all 3 service images to ECR.
#
# Usage:
#   ./infra/aws/scripts/push-images.sh <env> <image-tag>
#
# Examples:
#   ./infra/aws/scripts/push-images.sh staging sha-$(git rev-parse --short HEAD)
#   ./infra/aws/scripts/push-images.sh prod v1.2.3
#
# Prerequisites:
#   - AWS CLI configured with permissions to push to ECR
#   - Docker daemon running
#   - pnpm installed (for build step)
#   - Terraform outputs available (ECR repo URLs)
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

ENV="${1:-}"
TAG="${2:-}"

if [[ -z "$ENV" || -z "$TAG" ]]; then
  echo "ERROR: Usage: $0 <env> <image-tag>" >&2
  exit 1
fi

if [[ "$ENV" != "staging" && "$ENV" != "prod" ]]; then
  echo "ERROR: env must be 'staging' or 'prod'" >&2
  exit 1
fi

# ── Resolve paths ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
TF_ENV_DIR="${SCRIPT_DIR}/../envs/${ENV}"

echo "==> Resolving ECR repo URLs from Terraform outputs (env=${ENV})"
cd "${TF_ENV_DIR}"

# Read ECR repo URLs from terraform output (requires prior terraform apply)
ADMIN_API_REPO=$(terraform output -raw admin_api_repo_url 2>/dev/null || echo "")
WALLET_ENGINE_REPO=$(terraform output -raw wallet_engine_repo_url 2>/dev/null || echo "")
POLICY_ENGINE_REPO=$(terraform output -raw policy_engine_repo_url 2>/dev/null || echo "")

if [[ -z "$ADMIN_API_REPO" || -z "$WALLET_ENGINE_REPO" || -z "$POLICY_ENGINE_REPO" ]]; then
  echo "ERROR: Could not read ECR URLs from terraform output." >&2
  echo "       Run 'terraform apply' in envs/${ENV} first." >&2
  exit 1
fi

# Derive registry from any repo URL (everything before first /)
REGISTRY=$(echo "$ADMIN_API_REPO" | cut -d/ -f1)
AWS_REGION=$(echo "$REGISTRY" | grep -oP '(?<=\.ecr\.)[a-z0-9-]+(?=\.amazonaws)')

echo "==> Registry:  ${REGISTRY}"
echo "==> Region:    ${AWS_REGION}"
echo "==> Image tag: ${TAG}"

# ── ECR login ─────────────────────────────────────────────────────
echo "==> Authenticating Docker to ECR"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${REGISTRY}"

# ── Build + push each service ─────────────────────────────────────
build_and_push() {
  local SERVICE="$1"
  local REPO_URL="$2"
  local DOCKERFILE_DIR="${REPO_ROOT}/apps/${SERVICE}"

  echo ""
  echo "── ${SERVICE} ──────────────────────────────────────────────"

  if [[ ! -f "${DOCKERFILE_DIR}/Dockerfile" ]]; then
    echo "WARNING: No Dockerfile found at ${DOCKERFILE_DIR}/Dockerfile — skipping ${SERVICE}" >&2
    return 0
  fi

  echo "==> Building ${SERVICE}"
  docker build \
    --platform linux/amd64 \
    --label "git.sha=${TAG}" \
    --label "env=${ENV}" \
    -t "${REPO_URL}:${TAG}" \
    -t "${REPO_URL}:latest" \
    -f "${DOCKERFILE_DIR}/Dockerfile" \
    "${REPO_ROOT}"

  echo "==> Pushing ${SERVICE}:${TAG}"
  docker push "${REPO_URL}:${TAG}"

  echo "==> Pushing ${SERVICE}:latest"
  docker push "${REPO_URL}:latest"

  echo "==> ${SERVICE} pushed: ${REPO_URL}:${TAG}"
}

build_and_push "admin-api"     "${ADMIN_API_REPO}"
build_and_push "wallet-engine" "${WALLET_ENGINE_REPO}"
build_and_push "policy-engine" "${POLICY_ENGINE_REPO}"

echo ""
echo "==> All images pushed successfully."
echo "    admin-api:     ${ADMIN_API_REPO}:${TAG}"
echo "    wallet-engine: ${WALLET_ENGINE_REPO}:${TAG}"
echo "    policy-engine: ${POLICY_ENGINE_REPO}:${TAG}"
