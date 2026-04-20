# Wallet Portal — Makefile
# Targets are documented stubs; full wiring happens in the referenced phases.

.PHONY: help sync-go-schema db-generate db-migrate db-seed

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Database (Phase 03) ───────────────────────────────────────────────────────

db-generate: ## Generate Drizzle migration SQL from schema changes
	pnpm --filter @wp/admin-api db:generate

db-migrate: ## Apply pending migrations to DATABASE_URL
	pnpm --filter @wp/admin-api db:migrate

db-seed: ## Load dev seed fixtures
	pnpm --filter @wp/admin-api db:seed

# ── Go schema sync (Phase 08) ─────────────────────────────────────────────────

sync-go-schema: ## Regenerate sqlc queries for policy-engine from Drizzle SQL output
	@echo "sync-go-schema: stub — full wiring implemented in Phase 08."
	@echo "Steps when implemented:"
	@echo "  1. pnpm --filter @wp/admin-api db:generate  (ensure SQL is fresh)"
	@echo "  2. cp apps/admin-api/drizzle/migrations/*.sql apps/policy-engine/sqlc/schema/"
	@echo "  3. cd apps/policy-engine && sqlc generate"
