# Contributing to wallet-portal

Quick onboarding guide for new contributors.

## Prerequisites

- Node >= 20 (via [asdf](https://asdf-vm.com/) or [nvm](https://github.com/nvm-sh/nvm))
- Go 1.22 (via asdf: `asdf install golang 1.22.x`)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker + Docker Compose

## Start the Dev Stack

```bash
# Bring up Postgres, Redis, and all app services
./scripts/dev-up.sh

# Or manually:
docker compose -f infra/docker-compose.yml up -d postgres redis
pnpm install
pnpm dev        # starts all apps via turbo
```

Services:
| Service | Port |
|---|---|
| admin-api | http://localhost:3001 |
| wallet-engine | http://localhost:3002 |
| policy-engine | http://localhost:3003 |
| ui | http://localhost:5173 |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

Types: feat | fix | docs | refactor | test | ci | infra | perf | chore
Scopes: admin-api | wallet-engine | policy-engine | ui | shared | infra | ci | monorepo
```

Examples:
```
feat(wallet-engine): add UTXO selection for BTC withdrawals
fix(admin-api): correct session expiry header
ci: add Go race detector to CI matrix
```

Commit messages are validated by commitlint on pre-commit. The pre-commit hook also runs  (biome for TS/JS, gofmt for Go).

## Project Structure

```
apps/
  admin-api/     — Fastify API (auth, wallets, transactions)
  wallet-engine/ — HD wallet + signing engine
  policy-engine/ — Go custody policy gate
  ui/            — React SPA

packages/
  shared-types/  — Zod schemas + TypeScript types shared across apps
  config/        — Shared config loading utilities
  contracts/     — OpenAPI type generation sources
  ui-kit/        — Shared React component library

infra/
  docker-compose.yml    — Local dev stack
  aws/                  — IaC placeholder (post-MVP Terraform)

plans/                  — Implementation plans per feature/sprint
docs/                   — Architecture, standards, deployment docs
```

## Phase-Based Development

Features are developed in numbered phases. Before implementing:

1. Read the relevant phase file in 
2. Phases list file ownership — only modify files your phase owns
3. Check success criteria before marking phase complete

## Running Tests

```bash
pnpm -r test              # all workspaces
pnpm -r typecheck         # TypeScript checks
pnpm -r lint              # biome lint

# Go tests (policy-engine)
cd apps/policy-engine && go test ./... -race

# Vertical slice E2E (requires docker-compose stack running)
pnpm --filter @wp/wallet-engine test:vertical-slice
```

## Where Docs Live

| Doc | Path |
|---|---|
| Architecture |  |
| Code standards |  |
| Codebase summary |  |
| Roadmap |  |
| Deployment |  |

## PR Checklist

See  — fill every section before requesting review.
Branch protection on  requires: CI green + 1 approval.
