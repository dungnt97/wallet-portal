# Wallet Portal — Makefile
# Targets are documented stubs; full wiring happens in the referenced phases.

.PHONY: help sync-go-schema db-generate db-migrate db-seed \
        sqlc-generate go-build go-test go-run

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

# ── Go / policy-engine (Phase 08) ────────────────────────────────────────────

sync-go-schema: ## Sync schema.sql from Drizzle migrations then run sqlc generate
	@echo "Syncing schema from Drizzle migrations…"
	cat apps/admin-api/drizzle/migrations/0000_young_fantastic_four.sql \
	    apps/admin-api/drizzle/migrations/0001_audit_trigger.sql \
	    apps/admin-api/drizzle/migrations/0004_policy_tables.sql \
	  | sed 's/--> statement-breakpoint//g' \
	  > apps/policy-engine/internal/db/schema.sql
	@echo "Running sqlc generate…"
	cd apps/policy-engine && sqlc generate
	@echo "Done — internal/db/ regenerated."

sqlc-generate: sync-go-schema ## Alias: regenerate sqlc Go code from queries + schema

go-build: ## Build policy-engine binary → apps/policy-engine/bin/policy-engine
	cd apps/policy-engine && go build -o bin/policy-engine ./cmd/server/
	@echo "Binary: apps/policy-engine/bin/policy-engine ($(shell du -sh apps/policy-engine/bin/policy-engine | cut -f1))"

go-test: ## Run policy-engine tests with race detector
	cd apps/policy-engine && go test -race ./...

go-run: ## Run policy-engine locally (requires .env or env vars set)
	cd apps/policy-engine && go run ./cmd/server/
