# System Architecture — Wallet Portal

**Last Updated:** 2026-04-20
**Version:** 0.1.0 (MVP design)
**Project:** Wallet Portal — Custodial Treasury Admin

## Overview

Wallet Portal là admin portal cho custody treasury, staff dùng để: deposits, sweeps, withdrawals, multisig approval, audit. Hỗ trợ BNB (EVM) + Solana. 2/3 treasurer approval bắt buộc trước mọi outbound transfer. Hot + cold tier (label + policy, không tách infra).

## Service Map

Four-process backbone:

```
[Google Workspace OIDC]  [WebAuthn/TOTP]  [Ledger Nano X]  [MetaMask/Phantom EIP-1193]
           │                    │                │                     │
           └────────────────────┴────────────────┴─────────────────────┘
                                         │
                                         ▼
                                   ┌───────────┐
                                   │  Admin UI │  React + Vite + TS
                                   └─────┬─────┘  (SSO login, WebAuthn step-up,
                                         │        multisig dashboard, co-sign UI, audit viewer)
                                         │
                    ┌────────────────────┼──────────────────────────┐
                    ▼                    ▼                          ▼
            ┌──────────────┐     ┌──────────────┐           ┌──────────────┐
            │  Admin API   │────▶│ Policy Engine│──pre-sign─│Wallet Engine │
            │ Node/Fastify │     │     Go       │   guard   │ Node + chain │
            │ ledger/audit │     │auth-signer,  │           │ I/O          │
            │ RBAC         │     │limits, TL    │           │ ethers +     │
            └──────┬───────┘     └──────┬───────┘           │ @solana/web3 │
                   │                    │                   └──────┬───────┘
                   │                    │                          │
                   ▼                    ▼                          ▼
            ┌──────────────────────────────────────────────────────────┐
            │          PostgreSQL 16 (shared)                          │
            │  ledger + audit (append-only) + multisig_ops + wallets   │
            └──────────────────────────────────────────────────────────┘
                                         │
                                         ▼
                              ┌──────────────────┐
                              │ Redis + BullMQ   │  jobs: deposit_confirm,
                              │ (queue + pub-sub)│  sweep_execute,
                              └────────┬─────────┘  multisig_track, audit_emit
                                       │
                                       ▼
                        ┌────────┬──────────┬──────────┐
                        ▼        ▼          ▼          ▼
                    [Safe BNB] [Squads Sol] [RPC pool EVM] [RPC pool Solana]
```

**Rationale for Go Policy Engine in the middle of Node services:** different language = smaller blast radius if Admin API or Wallet Engine is compromised (RCE, dep supply-chain). Policy Engine is small, auditable, does one thing: check rules before any signing path executes.

## Core Flows

### Deposit

1. User deposits token → Wallet Engine block watcher detects incoming tx on user's HD address
2. BullMQ job `deposit_confirm` — wait N confirmations (chain-specific), then credit ledger (Admin API)
3. Admin API emits audit event → stream to UI via Socket.io
4. UI shows pending → confirmed state machine

### Sweep (hot aggregation)

1. Cron / threshold trigger (operational balance) → BullMQ `sweep_execute`
2. Wallet Engine constructs tx: user_hd → hot_multisig_address
3. Policy Engine approves (destination is whitelisted sweep target, amount ≤ daily limit)
4. 2/3 hot treasurer co-sign via UI (Safe/Squads)
5. Wallet Engine broadcasts, records tx hash, updates ledger on confirmation

### Withdrawal

1. Admin create withdrawal request → validation (user KYC tier, balance, whitelist)
2. Policy Engine gates: destination whitelist, daily/role limit, time-lock applied per tier
3. Treasurer 1 approves via UI → signs EIP-712 (BNB) or Squads proposal (Solana) with chosen wallet
4. Treasurer 2 approves — 2nd signature collected
5. Time-lock expires (if applicable) → Wallet Engine broadcasts
6. Confirmations tracked → ledger updated → audit log emitted

### Hot → Cold Sweep

Treated as intra-custody withdrawal. Source `hot_safe`, destination `cold_multisig_address` (pre-whitelisted). Policy Engine allows without full 2/3 if destination is whitelisted intra-custody address (config option).

## Hot + Cold Tier Design

**Same infra, different policy per tier.**

### Wallets table

```
wallets (
  id, chain, address,
  tier: 'hot' | 'cold',
  purpose: 'deposit_hd' | 'operational' | 'cold_reserve',
  multisig_addr,           -- which Safe/Squads contract owns this
  derivation_path,         -- HD path for auto-managed hot deposits
  policy_config JSONB
)
```

### Staff signing keys (registered owners)

```
staff_signing_keys (
  id, staff_id, chain,
  address,                 -- registered owner of Safe/Squads
  tier: 'hot' | 'cold',    -- this address is for which tier's multisig
  wallet_type,             -- 'metamask' | 'phantom' | 'ledger' | ...
  hw_attested BOOLEAN,     -- proven HW-backed at onboarding ceremony
  registered_at, revoked_at
)
```

Treasurer can have different addresses per tier: hot address from MetaMask, cold address from Ledger.

### Policy rules matrix

| Rule | Hot | Cold |
|---|---|---|
| Approval threshold | 2/3 | 2/3 (3/3 if amount ≥ $1M) |
| Time-lock | none < $50k, 24h ≥ $50k | 48h always |
| Daily limit | $1M | $5M |
| HW-backed required | optional (Open tier) | **required** (Policy Engine rejects `hw_attested=false`) |
| Destination whitelist | standard | stricter (pre-approved only) |
| Notification channel | Slack | Slack + email + SMS |

## Domain Model (DB Sketch)

```
staff_members (id, email, name, role, status, last_login_at)
staff_signing_keys (id, staff_id, chain, address, tier, wallet_type, hw_attested)

users (id, email, kyc_tier, risk_score, status, created_at)
user_addresses (id, user_id, chain, address, derivation_path, tier)

wallets (id, chain, address, tier, purpose, multisig_addr, policy_config)

deposits (id, user_id, chain, token, amount, status, confirmed_blocks, tx_hash)
withdrawals (id, user_id, amount, destination_addr, status, source_tier,
             multisig_op_id, time_lock_expires_at, created_by, created_at)

multisig_operations (id, withdrawal_id, chain, operation_type, multisig_addr,
                     required_sigs, collected_sigs, expires_at, status)
multisig_approvals (id, op_id, staff_id, staff_signing_key_id, signature, signed_at)

sweeps (id, chain, from_addr, to_multisig, amount, status, tx_hash)

transactions (id, hash, chain, from_addr, to_addr, amount, token,
              status, block_number, confirmed_at)

audit_log (id, staff_id, action, resource_type, resource_id,
           changes JSONB, ip_addr, ua, prev_hash, hash, created_at)
  -- append-only, hash-chained, retained 7 years

ledger_entries (id, tx_id, account, debit, credit, currency, created_at)
  -- double-entry: every tx = balanced debits + credits
```

## API Surface (Admin API)

REST + OpenAPI 3.1. Shared types codegen'd to UI + Policy Engine client.

- `POST /auth/session` — OIDC callback
- `POST /auth/webauthn/challenge`, `/auth/webauthn/verify` — step-up
- `GET /dashboard/metrics` — AUM, pending counts, block sync
- `GET /deposits`, `POST /deposits/:id/credit`
- `GET /withdrawals`, `POST /withdrawals`, `POST /withdrawals/:id/approve`, `/execute`, `/cancel`
- `GET /multisig-ops`, `POST /multisig-ops/:id/submit-signature`
- `GET /sweeps`, `POST /sweeps/trigger`
- `GET /users`, `POST /users`, `POST /users/:id/addresses`
- `GET /staff`, `POST /staff/signing-keys`
- `GET /audit-log` (paginated, filterable)
- `GET /wallets` — hot/cold address pools
- `GET /stream/events` (Socket.io upgrade) — live updates

## Background Jobs (BullMQ)

| Job | Trigger | Action |
|---|---|---|
| `deposit_confirm` | Wallet Engine block watcher | Wait confirmations, credit ledger |
| `sweep_execute` | Cron (hourly) + threshold | Consolidate user_hd → hot_safe |
| `multisig_track` | On approval submit | Poll Safe/Squads for on-chain state |
| `audit_emit` | On mutation | Append to audit_log (hash-chained) |

## Security Controls

- **Signing threshold:** 2/3 treasurer (hot + cold), time-lock per tier
- **Policy Engine (Go):** independent pre-sign guard — separate process, separate language. Whitelisted signer check, limits, destination whitelist, time-lock enforcement
- **WebAuthn step-up:** required on all write paths (5-min TTL per session)
- **Audit trail:** append-only, hash-chained, 7-year retention
- **Separation of duties:** creator ≠ approver ≠ executor (DB check constraints + triggers)
- **Secrets:** AWS Secrets Manager, 90-day rotation, IAM role-based access (no static creds)
- **Network:** VPC private subnets, ALB in public, services private. Cloudflare WAF at edge
- **Transport:** TLS 1.3 everywhere (internal mTLS between services)
- **At rest:** RDS encrypted (KMS), S3 SSE-KMS, Redis TLS + auth token
- **Rate limit:** Cloudflare edge + per-user sliding window in Admin API (Redis)

## Deployment Topology (AWS `ap-southeast-1`)

```
User browser
    │
    ▼
Cloudflare (WAF, DDoS, rate limit)
    │
    ├──▶ CloudFront + S3 (Admin UI static bundle)
    │
    └──▶ ALB (HTTPS)
              │
              ▼
          VPC private subnets
              │
       ┌──────┼──────────────────┐
       ▼      ▼                  ▼
  ECS Fargate services:
  - admin-api    (Node, Fastify)
  - policy-engine (Go)
  - wallet-engine (Node)
              │
       ┌──────┴────────┐
       ▼               ▼
  RDS Postgres       ElastiCache Redis
  (Multi-AZ,         (cluster mode,
   encrypted,        TLS, auth token)
   35d backup)
              │
              ▼
  Secrets Manager (DB creds, RPC keys, Google OAuth)
              │
              ▼
  CloudWatch Logs + Prometheus (metrics) + Sentry (errors)
```

## Scalability Notes

- Single region MVP (`ap-southeast-1`). Add cross-region read replica if compliance demands
- Wallet Engine RPC pool: Alchemy primary, QuickNode failover, self-hosted BNB/Solana node as last resort
- BullMQ concurrency tuned per job type (e.g. `sweep_execute` serialized to avoid double-spend races)
- DB: partition `audit_log` by month after 1y retention
- Socket.io with Redis adapter → horizontal scale of gateway

## Evolution Path

- AUM > $10M: tighten Open tier — amount-gated HW requirement for hot
- AUM > $50M: add air-gapped signing machine for cold (new process, plug into multisig flow)
- More chains: add `chain_adapter` interface in Wallet Engine (per-chain HD derivation + block watcher + RPC pool)
- High throughput: split Wallet Engine per chain (one process per chain for isolation)
- Compliance (MAS/BitLicense): add separate immutable audit DB (WORM S3 export)

## Open Risks (to track)

- RPC provider outage — mitigated by pool; still risk of quorum failure
- Safe/Squads protocol bug — mitigate by pinning contract versions, monitoring audits
- Treasurer HW key loss — mitigate by 3-of-N (allow rotation, add 4th backup treasurer later)
- BullMQ job loss — ensure persistent Redis config + job retry + dead-letter queue
- WebAuthn lockout — recovery via admin-reset with audit
