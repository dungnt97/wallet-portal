# Wallet Portal

![CI](https://github.com/dungnt97/wallet-portal/actions/workflows/ci.yml/badge.svg)
![Node](https://img.shields.io/badge/node-20.x-339933?logo=nodedotjs&logoColor=white)
![Go](https://img.shields.io/badge/go-1.25-00ADD8?logo=go&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-9.15-F69220?logo=pnpm&logoColor=white)
![License](https://img.shields.io/badge/license-UNLICENSED-blue)

**Custodial treasury admin portal** for managing on-chain assets across **BNB (EVM)** and **Solana**. Staff use it to handle deposits, sweeps, withdrawals, multisig approvals, and audit — with **2/3 treasurer co-sign** required before every outbound transfer and a hot/cold tier model enforced by policy.

> Built as a four-process backbone (UI · Admin API · Policy Engine · Wallet Engine) backed by Postgres 16 + Redis. Policy is gated by a Go service so a compromise in either Node service has a smaller blast radius.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Available Scripts](#available-scripts)
- [Environment Configuration](#environment-configuration)
- [Local Endpoints](#local-endpoints)
- [Testing](#testing)
- [Observability](#observability)
- [Documentation](#documentation)
- [Contributing](#contributing)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Google Workspace OIDC · WebAuthn / TOTP · Ledger · MetaMask/Phantom │
└──────────────────────────────────┬──────────────────────────────────┘
                                   ▼
                            ┌────────────┐
                            │  Admin UI  │  React + Vite + TS  (5173)
                            └─────┬──────┘
              ┌────────────────────┼─────────────────────┐
              ▼                    ▼                     ▼
      ┌──────────────┐     ┌──────────────┐      ┌──────────────┐
      │  Admin API   │────▶│Policy Engine │──────│Wallet Engine │
      │ Node/Fastify │     │      Go      │ guard│ Node + chain │
      │  (3001)      │     │   (3003)     │      │   (3002)     │
      └──────┬───────┘     └──────┬───────┘      └──────┬───────┘
             │                    │                     │
             └────────────────────┼─────────────────────┘
                                  ▼
                ┌──────────────────────────────────┐
                │  PostgreSQL 16   ·   Redis 7     │
                │  ledger · audit · multisig_ops   │
                └──────────────────────────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                ▼                 ▼                 ▼
          [Safe BNB]        [Squads SOL]       [RPC pools]
```

**Why a Go policy engine in the middle of two Node services?** Different runtime → smaller blast radius if either Node service is compromised (RCE, supply-chain). The policy engine is small, auditable, and does one thing: check rules before any signing path executes. See [`docs/system-architecture.md`](./docs/system-architecture.md).

---

## Tech Stack

| Layer            | Technology                                                                   |
| ---------------- | ---------------------------------------------------------------------------- |
| **UI**           | React 18, Vite 5, TypeScript 5, TanStack Query, Tailwind, wagmi/viem, Solana wallet adapter |
| **Admin API**    | Node 20, Fastify 5, Zod, Drizzle ORM, BullMQ, Socket.io, WebAuthn, OIDC      |
| **Wallet Engine**| Node 20, Fastify, ethers v6, `@solana/web3.js`, `@sqds/multisig`             |
| **Policy Engine**| Go 1.25, chi, pgx, sqlc, Prometheus                                          |
| **Storage**      | PostgreSQL 16, Redis 7                                                       |
| **Observability**| OpenTelemetry, Prometheus, Grafana, Jaeger, Sentry                           |
| **Testing**      | Vitest 2, Playwright, `go test -race`                                        |
| **Tooling**      | pnpm 9 workspaces, Turborepo, Biome, Husky, Docker Compose                   |

---

## Repository Layout

```
wallet-portal/
├── apps/
│   ├── admin-api/        # Fastify API — auth, ledger, audit, RBAC      (:3001)
│   ├── wallet-engine/    # Chain I/O — block watcher, sweep, broadcast  (:3002)
│   ├── policy-engine/    # Go gate — pre-sign rules, limits, time-lock  (:3003)
│   └── ui/               # React admin portal                            (:5173)
├── packages/
│   ├── shared-types/     # Cross-service TypeScript contracts
│   ├── ui-kit/           # Shared shadcn/Radix components
│   ├── contracts/        # Chain ABI / IDL definitions
│   └── config/           # Shared eslint/biome/tsconfig
├── infra/
│   ├── docker-compose.yml  # postgres, redis, otel, observability profile
│   ├── postgres/, redis/, otel/, prometheus/, grafana/
│   ├── chain/              # Local devnet / testnet helpers
│   └── aws/                # IaC (terraform)
├── scripts/
│   ├── dev-up.sh, dev-down.sh, dev-status.sh   # Stack lifecycle
│   ├── e2e-testnet/                            # Real-testnet E2E harness
│   └── eval/                                   # Agent eval harness
├── docs/                  # Architecture, runbooks, roadmap, code standards
├── plans/                 # Implementation plans + agent reports
└── .claude/               # Claude Code agent + skill configuration
```

---

## Prerequisites

- **Node.js** ≥ 20 (`.nvmrc` pins to 20.x — `nvm use`)
- **pnpm** 9.15.0 (the version in `packageManager`; install with `corepack enable`)
- **Go** 1.25.x (only required if running/building `policy-engine` outside Docker)
- **Docker** + **Docker Compose v2** (Docker Desktop, OrbStack, or colima)
- **Make** (for Go + sqlc helpers)
- macOS 13+, Ubuntu 22.04+, or WSL2

---

## Quick Start

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Copy env templates (one-time)
cp infra/.env.compose.example          infra/.env.compose
cp apps/admin-api/.env.example         apps/admin-api/.env
cp apps/wallet-engine/.env.example     apps/wallet-engine/.env
cp apps/policy-engine/.env.example     apps/policy-engine/.env
cp apps/ui/.env.example                apps/ui/.env

# 3. Boot the full stack (infra + migrations + seed + apps)
pnpm dev:up

# 4. In another terminal, verify everything is healthy
pnpm dev:status
```

The first run pulls Postgres / Redis / OTel-collector images and applies migrations + seeds — expect ~30–60s on a warm cache. Subsequent runs are seconds.

To stop and wipe local volumes:

```bash
pnpm dev:down
```

### Infra-only mode

If you'd rather run apps from your IDE for breakpoints:

```bash
pnpm dev:up:infra        # postgres + redis + otel only
pnpm dev                 # turbo run dev — starts the four apps
```

---

## Available Scripts

All scripts run from the repo root unless noted.

### Stack lifecycle

| Script               | Action                                                         |
| -------------------- | -------------------------------------------------------------- |
| `pnpm dev:up`        | Start infra → migrate DB → seed fixtures → run all four apps   |
| `pnpm dev:up:infra`  | Start postgres + redis + otel only                             |
| `pnpm dev`           | `turbo run dev` — start apps (assumes infra is already running)|
| `pnpm dev:down`      | Stop compose services and remove volumes (destructive)         |
| `pnpm dev:status`    | Print compose state + HTTP health probes for all services      |
| `pnpm dev:logs`      | Tail compose logs                                              |

### Build, test, quality

| Script                | Action                                          |
| --------------------- | ----------------------------------------------- |
| `pnpm build`          | Turbo build across all workspaces               |
| `pnpm typecheck`      | Strict TS typecheck (every package)             |
| `pnpm lint`           | Biome linting                                   |
| `pnpm format`         | Biome write-format                              |
| `pnpm test`           | All Vitest suites in every app                  |
| `pnpm test:coverage`  | All suites with V8 coverage                     |
| `pnpm e2e`            | UI Playwright suite (smoke)                     |
| `pnpm e2e:testnet`    | Real-testnet E2E (Solana devnet + BNB Chapel)   |
| `pnpm go:build`       | Build the policy-engine binary (Go)             |
| `pnpm go:test`        | `go test -race ./...`                           |

### Database

| Script              | Action                                         |
| ------------------- | ---------------------------------------------- |
| `pnpm db:migrate`   | Apply pending Drizzle migrations               |
| `pnpm db:seed`      | Load idempotent dev fixtures (staff, wallets)  |
| `pnpm db:reset`     | Drop + recreate local DB                       |

> Lower-level Go helpers (`make sync-go-schema`, `make sqlc-generate`) live in the [`Makefile`](./Makefile).

---

## Environment Configuration

Each service reads its own `.env` (see `*.env.example`). Key variables:

| File                            | Critical variables                                                                |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `infra/.env.compose`            | `POSTGRES_*`, `REDIS_URL` — wiring for compose services                           |
| `apps/admin-api/.env`           | `DATABASE_URL`, `SESSION_SECRET`, `SVC_BEARER_TOKEN`, `GOOGLE_CLIENT_ID/SECRET`, `WEBAUTHN_*` |
| `apps/wallet-engine/.env`       | `DATABASE_URL`, `RPC_BNB_*`, `RPC_SOLANA_*`, `HD_MASTER_XPUB_BNB`, `SVC_BEARER_TOKEN` |
| `apps/policy-engine/.env`       | `DATABASE_URL`, `SVC_BEARER_TOKEN`, `POLICY_DEV_MODE`                             |
| `apps/ui/.env`                  | `VITE_ADMIN_API_URL`, `VITE_AUTH_DEV_MODE`                                        |

**Generate secrets:**

```bash
openssl rand -hex 32        # SESSION_SECRET, SVC_BEARER_TOKEN, etc.
```

> `SVC_BEARER_TOKEN` must be **identical** across `admin-api`, `wallet-engine`, and `policy-engine` — it gates all internal `/internal/*` routes.

---

## Local Endpoints

After `pnpm dev:up` (defaults — change `PORT` in each `.env` if they collide):

| Service        | URL                                | Purpose                              |
| -------------- | ---------------------------------- | ------------------------------------ |
| UI             | http://localhost:5173              | Admin portal                         |
| Admin API      | http://localhost:3001              | REST API                             |
| Admin API docs | http://localhost:3001/docs         | Swagger UI                           |
| Wallet Engine  | http://localhost:3002              | Internal chain I/O                   |
| Policy Engine  | http://localhost:3003              | `/v1/check`, `/health/*`, `/metrics` |
| Postgres       | `postgres://postgres:postgres@localhost:5433/wallet_portal` | DB |
| Redis          | `redis://localhost:6380`           | Queues + pub-sub                     |
| OTel collector | `http://localhost:4318` (HTTP)     | Trace ingest                         |

### Observability profile (opt-in)

```bash
docker compose -f infra/docker-compose.yml --profile observability up -d
```

Adds Jaeger (`:16686`), Prometheus (`:9090`), and Grafana (`:3000`, login `admin` / `devpass`).

---

## Testing

```bash
pnpm test                # all unit suites
pnpm test:coverage       # with V8 coverage reporter
pnpm e2e                 # UI Playwright smoke
pnpm e2e:testnet         # real-testnet E2E (Solana devnet + BNB Chapel)
make go-test             # policy-engine Go suite with race detector
```

CI (`.github/workflows/ci.yml`) runs:

1. **Lint + Typecheck** — Biome + tsc + `go vet` + golangci-lint
2. **Unit Tests** — admin-api, wallet-engine, ui (Vitest), policy-engine (Go)
3. **Smoke E2E** — Playwright against the full stack
4. **Testnet E2E** — gated, runs against real Solana devnet + BNB Chapel

---

## Observability

- **Tracing** — every service exports OTLP/HTTP to the collector at `:4318` (service name set per app via `OTEL_SERVICE_NAME`)
- **Metrics** — Prometheus pulls from each app's `/metrics` endpoint
- **Logs** — structured JSON via Pino (Node) / zerolog (Go); tail with `pnpm dev:logs`
- **Errors** — Sentry SDK is wired into all four apps; leave `SENTRY_DSN` unset to disable (zero overhead)

Dashboards live in `infra/grafana/dashboards/`. See the [observability guide](./docs/observability/) for setup.

---

## Documentation

| Document                                                                | Purpose                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------ |
| [`docs/system-architecture.md`](./docs/system-architecture.md)          | Full system design, flows, hot/cold tier model   |
| [`docs/project-overview-pdr.md`](./docs/project-overview-pdr.md)        | Product requirements, roles, scope               |
| [`docs/code-standards.md`](./docs/code-standards.md)                    | Conventions, naming, review checklist            |
| [`docs/codebase-summary.md`](./docs/codebase-summary.md)                | Auto-generated structural overview               |
| [`docs/project-roadmap.md`](./docs/project-roadmap.md)                  | Phase tracking and milestones                    |
| [`docs/feature-matrix.md`](./docs/feature-matrix.md)                    | Per-feature status (auth, sweep, recovery, etc.) |
| [`docs/runbooks/`](./docs/runbooks/)                                    | Ops playbooks (key rotation, alerts, backups)    |
| [`docs/tech-stack.md`](./docs/tech-stack.md)                            | Library + version inventory                      |

---

## Contributing

1. Branch off `main`: `git checkout -b feat/<scope>-<short-name>`
2. Follow [Conventional Commits](https://www.conventionalcommits.org/) — no AI attribution in commit messages.
3. Run before pushing:
   ```bash
   pnpm lint && pnpm typecheck && pnpm test
   ```
4. Open a PR — CI must be green; reviewers expect: tests for new behavior, no mocking around real bugs, docs updated when behavior changes.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full checklist.

---

## License

UNLICENSED — internal/private project. See [`LICENSE`](./LICENSE).
