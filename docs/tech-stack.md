# Tech Stack — Wallet Portal

**Last Updated:** 2026-04-20
**Version:** 0.1.0
**Status:** Locked (MVP)

Custodial treasury wallet admin portal. Multi-chain (BNB + Solana), 2/3 treasurer multisig, hot+cold tier, Google Workspace SSO + WebAuthn step-up.

---

## Frontend

| Layer | Choice | Notes |
|---|---|---|
| Framework | **React 18 + Vite 5** | Per architecture diagram. SPA on `portal.wallets.internal` |
| Language | **TypeScript 5.4+** | Non-negotiable for custody |
| Styling | **Tailwind CSS 4** (CSS variables plugin) | Prototype uses OKLCH tokens — native support |
| UI Kit | **shadcn/ui + Radix** | Headless, a11y WCAG 2.1 AA |
| State | **Zustand 4** (UI) + **TanStack Query 5** (server) | React Context for auth only |
| Routing | **React Router 6** | Hash → history mode in prod |
| Forms | **React Hook Form 7 + Zod 3** | Schema shared with backend |
| Tables | **TanStack Table v8** | Server-side pagination (audit log 10k+ rows) |
| Charts | **Recharts 2.10** | Dashboard AUM trend, volumes |
| Icons | **Lucide React** | Tree-shakeable |
| i18n | **i18next + browser-languagedetector** | EN + VI; crypto terms EN |
| Realtime | **Socket.io client** | Block events, multisig sig broadcasts |
| EVM Wallet | **Wagmi 2 + Viem 2** | Multi-connector: MetaMask, WalletConnect, Coinbase, Ledger Connect (EIP-6963) |
| Solana Wallet | **@solana/web3.js + @solana/wallet-adapter** | Phantom, Solflare, Backpack, Ledger |

## Backend

| Service | Stack | Responsibility |
|---|---|---|
| **Admin API** | Node 20 + Fastify 4 + TypeScript + **Drizzle ORM** | Business logic, ledger (double-entry), RBAC, audit emit, Safe/Squads webhooks, SSO/WebAuthn verify |
| **Policy Engine** | **Go 1.22** + chi + sqlc | Independent pre-sign guard: authorized-signer check, daily/role limits, destination whitelist, time-lock & expiry. Different language = smaller blast radius |
| **Wallet Engine** | Node 20 + TypeScript + ethers.js 6 + @solana/web3.js + Drizzle | Chain I/O: HD address derivation, block watcher, confirmations, sweep sign/broadcast, RPC pool |
| **Job Queue** | **Redis 7 + BullMQ** | Jobs: `deposit_confirm`, `sweep_execute`, `multisig_track`, `audit_emit` |

## Data & Shared

| Layer | Choice | Notes |
|---|---|---|
| Primary DB | **PostgreSQL 16** | Shared between Admin API + Wallet Engine. ACID + JSONB + append-only audit |
| Cache / Pub-Sub | **Redis 7** | BullMQ backend + Socket.io adapter |
| ORM (Node) | **Drizzle** | Type-safe, TS-native |
| ORM (Go) | **sqlc** | Compile-time SQL validation |

## Auth & Security

| Layer | Choice |
|---|---|
| SSO | **Google Workspace OIDC** (staff directory, account lifecycle, offboard) |
| Step-up MFA | **WebAuthn** (platform key / YubiKey) + **TOTP** fallback. 5-min TTL on writes |
| Hardware wallet | **Ledger Nano X** for cold tier (required), hot tier optional |
| Wallet bridge | MetaMask / Phantom (EIP-1193) — any wallet via Wagmi/wallet-adapter |
| Multisig | **Safe** (BNB) + **Squads Protocol** (Solana), 2/3 treasurer |
| Signing policy | **Open tier** — treasurer register address, Policy Engine check address match. Cold tier requires `hw_attested=true` |
| Secrets | **AWS Secrets Manager** (90-day rotation) |
| Audit trail | Immutable append-only log (hash-chained or DB CONSTRAINT) |

## Scope

| Item | MVP |
|---|---|
| Chains | **BNB mainnet + Solana mainnet** |
| Tokens | USDT, USDC (ERC-20 BEP-20 + SPL) |
| Roles | admin / treasurer / operator / viewer |
| Tiers | hot + cold (separate Safe/Squads multisig per tier, same infra) |
| Locales | EN, VI |

## Repo & Tooling

| Layer | Choice |
|---|---|
| Structure | **Monorepo** (`apps/{ui,admin-api,policy-engine,wallet-engine}` + `packages/{shared-types,ui-kit,contracts,config}`) |
| Package Mgr | **pnpm 9** (workspaces) |
| Orchestration | **Turborepo 2** |
| Linting | **Biome** (Node/TS) + **golangci-lint** (Go) |
| Testing (Node) | **Vitest + Testing Library** |
| Testing (Go) | stdlib + testify |
| E2E | **Playwright** |
| Git hooks | **Husky + lint-staged + commitlint** (conventional commits) |
| Release | **semantic-release** (private, auto-tag only) |

## Infra (AWS)

| Component | Service |
|---|---|
| Frontend hosting | **S3 + CloudFront** (SPA), ACM cert, custom domain |
| Backend compute | **ECS Fargate** (all 3 services), ALB |
| DB | **RDS PostgreSQL 16 Multi-AZ**, encrypted (KMS), backups 35d |
| Cache/Queue | **ElastiCache Redis** (cluster mode, TLS, auth token) |
| Network | VPC private subnets, NAT gateway, security groups least-privilege |
| Secrets | **AWS Secrets Manager** + IAM roles (no static creds) |
| Edge / WAF | **Cloudflare** (WAF, DDoS, rate limit) → CloudFront / ALB |
| CI/CD | **GitHub Actions** (build → test → staging → manual approval → prod) |
| Container registry | ECR |
| Observability | **OpenTelemetry** → **Prometheus + Grafana** (managed or self-hosted). Logs: CloudWatch + **Pino** structured JSON. Errors: **Sentry** |
| Alerting | CloudWatch Alarms + PagerDuty |

## Explicit Non-Goals (MVP)

- No Ethereum mainnet, no L2s (Polygon/Arbitrum/Optimism)
- No Bitcoin / UTXO chains
- No AWS CloudHSM (use Ledger HW at user layer)
- No air-gapped signing ceremony (evolve later if AUM > $50M)
- No GraphQL / tRPC (REST + OpenAPI only)
- No multi-region (single `ap-southeast-1` initially)
- No ML risk scoring (manual review)
- No on-chain analytics platform (read-only RPC)

## Evolution Path

- AUM > $10M: add amount-gated HW requirement for hot tier
- AUM > $50M or regulator (MAS/BitLicense): add air-gapped cold signer machine
- Multi-region: RDS cross-region replica + CloudFront failover
- More chains: add `chain_adapter` abstraction in Wallet Engine (HD derivation + block watcher per chain)
