#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# deploy-ui.sh — Build UI, sync to S3, invalidate CloudFront cache.
#
# Usage:
#   ./infra/aws/scripts/deploy-ui.sh <env>
#
# Examples:
#   ./infra/aws/scripts/deploy-ui.sh staging
#   ./infra/aws/scripts/deploy-ui.sh prod
#
# Prerequisites:
#   - AWS CLI configured with permissions to write to S3 + CF
#   - pnpm installed
#   - Terraform outputs available (S3 bucket, CF distribution ID)
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

ENV="${1:-}"

if [[ -z "$ENV" ]]; then
  echo "ERROR: Usage: $0 <env>" >&2
  exit 1
fi

if [[ "$ENV" != "staging" && "$ENV" != "prod" ]]; then
  echo "ERROR: env must be 'staging' or 'prod'" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
TF_ENV_DIR="${SCRIPT_DIR}/../envs/${ENV}"
UI_DIR="${REPO_ROOT}/apps/ui"

# ── Read infra outputs ────────────────────────────────────────────
echo "==> Reading Terraform outputs (env=${ENV})"
cd "${TF_ENV_DIR}"

UI_BUCKET=$(terraform output -raw ui_bucket_id 2>/dev/null || echo "")
CF_DIST_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")

if [[ -z "$UI_BUCKET" || -z "$CF_DIST_ID" ]]; then
  echo "ERROR: Could not read S3 bucket or CloudFront distribution ID from terraform output." >&2
  echo "       Run 'terraform apply' in envs/${ENV} first." >&2
  exit 1
fi

echo "==> S3 bucket:              ${UI_BUCKET}"
echo "==> CloudFront distribution: ${CF_DIST_ID}"

# ── Build UI ──────────────────────────────────────────────────────
echo ""
echo "==> Building UI (pnpm --filter @wp/ui build)"
cd "${REPO_ROOT}"
pnpm --filter @wp/ui build

DIST_DIR="${UI_DIR}/dist"
if [[ ! -d "$DIST_DIR" ]]; then
  echo "ERROR: Build output not found at ${DIST_DIR}" >&2
  exit 1
fi

# ── Sync to S3 ────────────────────────────────────────────────────
echo ""
echo "==> Syncing ${DIST_DIR} → s3://${UI_BUCKET}/"

# Sync assets with long cache headers (hashed filenames)
aws s3 sync "${DIST_DIR}/assets/" "s3://${UI_BUCKET}/assets/" \
  --cache-control "public, max-age=31536000, immutable" \
  --delete

# Sync HTML + root files with no-cache (must revalidate)
aws s3 sync "${DIST_DIR}/" "s3://${UI_BUCKET}/" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --exclude "assets/*" \
  --delete

echo "==> Sync complete"

# ── Invalidate CloudFront ─────────────────────────────────────────
echo ""
echo "==> Invalidating CloudFront distribution ${CF_DIST_ID}"
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "${CF_DIST_ID}" \
  --paths "/*" \
  --query "Invalidation.Id" \
  --output text)

echo "==> Invalidation created: ${INVALIDATION_ID}"
echo "    (Propagation takes ~30-60s; monitor via AWS console or:"
echo "    aws cloudfront get-invalidation --distribution-id ${CF_DIST_ID} --id ${INVALIDATION_ID})"

echo ""
echo "==> Deploy complete for env=${ENV}"
