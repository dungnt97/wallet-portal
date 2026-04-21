# Feature Matrix — Wallet Portal

**Last Updated:** 2026-04-21
**Status:** Living document — update after every feature slice ships
**Purpose:** Track every feature × every layer so no gap slips through. Each cell's status must match reality, not intent.

---

## Legend

| Symbol | Meaning |
|---|---|
| 🟢 | Real — wired end-to-end against actual backend/chain/DB, covered by tests |
| 🟡 | Stub / mock — UI renders, endpoint exists but returns fixture or mock data |
| ❌ | Not started |
| — | Not applicable to this layer |
| 🔒 | Blocked by external dep (e.g. AWS KMS account, Google Workspace setup) |

## Priority tiers

| Tier | Definition |
|---|---|
| **P0** | Critical path for custody — money moves, must be real before any end-user onboarding |
| **P1** | Compliance + ops hygiene — audit trail, notifications, reconciliation |
| **P2** | Admin convenience — user management, signer ceremonies, recovery |
| **P3** | Nice-to-have / future scale — multi-chain, analytics, advanced UX |

## Layers checklist

A feature is 🟢 only when ALL applicable layers below are 🟢:

| Layer | What "real" means |
|---|---|
| **UI** | Page/modal renders with prototype fidelity, `useTranslation` on primary strings, interactions wired |
| **API** | Route exists, Zod schema validates, OpenAPI doc generated, auth/step-up gates correct |
| **Service** | Business logic in `src/services/*.ts` with at least one DB transaction + unit test |
| **DB** | Real Postgres tables + migrations, queries tested against real DB (not mocked) |
| **Policy** | Policy Engine rule eval gates the signing path (when applicable) |
| **Chain** | Real RPC call to testnet at minimum; broadcast + confirmation tracked |
| **Tests** | Unit (per service) + integration (API + DB) + E2E (Playwright for happy path) |
| **i18n** | EN + VI keys for all user-facing copy |
| **Docs** | API endpoint documented in OpenAPI; ops runbook if flow has manual steps |
| **Obs** | OTel span around the action, Pino structured log, Prometheus metric, audit event emitted |

---

## Master feature matrix

### Authentication & Identity

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Google Workspace OIDC login | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟡 | 🟢 | 🟡 | 🟡 |
| WebAuthn register | P0 | 🟡 | 🟢 | 🟢 | 🟢 | — | — | 🟡 | 🟢 | ❌ | 🟡 |
| WebAuthn step-up verify | P0 | 🟡 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | ❌ | 🟡 |
| TOTP fallback | P1 | 🟡 mock | ❌ | ❌ | ❌ | — | — | ❌ | 🟡 | ❌ | ❌ |
| Session logout | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟡 | 🟢 | ❌ | 🟡 |
| Dev-login quick-switch | — | 🟢 | 🟢 | 🟢 | 🟢 | — | — | ❌ | 🟢 | 🟢 | ❌ |
| Staff directory sync (GW) | P2 | — | ❌ | ❌ | 🟢 | — | — | ❌ | — | ❌ | ❌ |
| Account settings modal | P2 | 🟡 stub | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Security settings (keys list) | P1 | 🟡 | 🟡 | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Login history | P1 | 🟡 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |

### Deposits

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Deposit detect (BNB) | P0 | — | — | — | — | — | 🟡 simulate-only | 🟡 | — | ❌ | 🟡 |
| Deposit detect (Solana) | P0 | — | — | — | — | — | ❌ | ❌ | — | ❌ | ❌ |
| Deposit confirm (BullMQ job) | P0 | — | — | 🟡 simulated | 🟢 | — | 🟡 | 🟡 | — | 🟡 | 🟡 |
| Credit to ledger | P0 | — | 🟢 internal | 🟢 | 🟢 | — | — | 🟢 | — | 🟡 | 🟡 |
| Deposit list + filter | P0 | 🟢 | 🟢 | 🟡 | 🟢 | — | — | 🟡 | 🟡 | 🟡 | 🟡 |
| Deposit detail sheet | P0 | 🟢 | 🟢 single | 🟡 | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Socket.io live update | P0 | 🟢 | 🟢 | 🟢 | — | — | — | ❌ | — | ❌ | 🟡 |
| Manual credit (admin override) | P2 | ❌ | ❌ | ❌ | 🟢 | ❌ | — | ❌ | ❌ | ❌ | ❌ |
| Deposit export CSV | P1 | 🟡 | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |

### Sweep (Hot Aggregation)

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sweep candidate scan | P0 | 🟡 fixture | 🟡 stub | ❌ | 🟢 | — | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Sweep tx construction | P0 | — | — | ❌ | — | — | ❌ | ❌ | — | ❌ | ❌ |
| Policy gate (sweep destination) | P0 | — | — | — | — | 🟡 rule exists | — | 🟡 | — | ❌ | ❌ |
| 2/3 sign sweep (Safe) | P0 | 🟡 mock | ❌ | ❌ | 🟢 | 🟡 | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Broadcast sweep tx | P0 | ❌ | ❌ | ❌ | 🟢 | — | ❌ | ❌ | — | ❌ | ❌ |
| Batch sweep UI | P1 | 🟢 | ❌ | ❌ | 🟢 | ❌ | — | ❌ | 🟡 | ❌ | ❌ |
| Sweep history | P1 | 🟢 | 🟡 stub | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Gas monitor | P1 | 🟢 fixture | ❌ | ❌ | — | — | ❌ | ❌ | 🟡 | ❌ | ❌ |

### Withdrawals

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Create withdrawal (form) | P0 | 🟢 | 🟡 stub | ❌ | 🟢 | ❌ | — | ❌ | 🟡 | ❌ | ❌ |
| Destination whitelist lookup | P0 | 🟡 | ❌ | ❌ | 🟢 | 🟡 rule exists | — | 🟡 | 🟡 | ❌ | ❌ |
| Pre-check policy (limits/tier/HW) | P0 | 🟡 | 🟡 stub | ❌ | 🟢 | 🟢 rule eval | — | 🟢 | 🟡 | ❌ | ❌ |
| Treasurer approve (sign) | P0 | 🟡 mock modal | 🟡 stub | ❌ | 🟢 | 🟢 eval | ❌ no-broadcast | ❌ | 🟡 | ❌ | ❌ |
| Treasurer reject | P0 | 🟡 mock | 🟡 stub | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Time-lock countdown | P0 | 🟡 visual | 🟡 stub | ❌ | 🟢 | 🟢 rule | — | 🟢 | 🟡 | ❌ | ❌ |
| Execute (broadcast) | P0 | ❌ | 🟡 stub | ❌ | 🟢 | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cancel withdrawal | P0 | 🟡 | 🟡 stub | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Safe multisig integration | P0 | ❌ | ❌ | ❌ | 🟢 | — | ❌ | ❌ | — | ❌ | ❌ |
| Squads multisig integration | P0 | ❌ | ❌ | ❌ | 🟢 | — | ❌ | ❌ | — | ❌ | ❌ |
| Wagmi / Viem wiring | P0 | ❌ mock | — | — | — | — | ❌ | ❌ | — | ❌ | — |
| Solana wallet adapter wiring | P0 | ❌ mock | — | — | — | — | ❌ | ❌ | — | ❌ | — |
| Withdrawal export CSV | P1 | 🟡 | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |

### Multisig

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Ops queue display | P0 | 🟢 | 🟡 stub | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Signer progress (x/3) | P0 | 🟢 | 🟡 | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Vault cards (hot + cold) | P0 | 🟢 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Treasurer team card | P1 | 🟢 | 🟢 via /staff | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Submit signature API | P0 | 🟡 | 🟡 stub | ❌ | 🟢 | 🟢 eval | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Safe Tx Service submit | P0 | ❌ | ❌ | ❌ | — | — | ❌ | ❌ | — | ❌ | ❌ |
| Squads proposal submit | P0 | ❌ | ❌ | ❌ | — | — | ❌ | ❌ | — | ❌ | ❌ |
| Multisig webhook in | P0 | — | ❌ | ❌ | 🟢 | — | ❌ | ❌ | — | ❌ | ❌ |

### Cold Storage

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Cold address list | P1 | 🟢 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Hot↔cold balance view | P1 | 🟢 fixture | ❌ | ❌ | 🟢 | — | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Rebalance hot→cold | P0 | 🟡 | ❌ | ❌ | 🟢 | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Withdrawal from cold (48h tl) | P0 | ❌ | ❌ | ❌ | 🟢 | 🟢 rule | ❌ | 🟢 rule | ❌ | ❌ | ❌ |
| HW-attested enforcement | P0 | ❌ | — | — | 🟢 | 🟢 rule | — | 🟢 | ❌ | ❌ | ❌ |
| Key ceremony log | P2 | 🟡 fixture | ❌ | ❌ | 🔒 need table | — | — | ❌ | 🟡 | ❌ | ❌ |

### Audit

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Audit event emit | P0 | — | 🟢 internal | 🟢 | 🟢 | — | — | 🟡 | — | 🟡 | 🟡 |
| Hash-chain enforce | P0 | — | — | 🟢 DB trigger | 🟢 | — | — | 🟢 | — | 🟡 | — |
| Audit list + filter | P1 | 🟢 fixture | 🟡 stub | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Audit export CSV | P1 | 🟡 client-side | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Audit export S3 WORM | P1 | — | ❌ | ❌ | 🟢 | — | ❌ | ❌ | — | ❌ | ❌ |
| Login history | P1 | 🟡 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Search (staff/action/resource) | P1 | 🟡 client | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |

### Signers (staff signing keys)

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Register signing key (onboard) | P0 | 🟡 form | 🟡 stub | ❌ | 🟢 | — | 🟡 challenge sign | ❌ | 🟡 | ❌ | ❌ |
| HW attestation ceremony | P0 | ❌ | ❌ | ❌ | 🟢 | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| Rotate key (request → approve) | P1 | 🟡 form | ❌ | ❌ | 🟢 | 🔒 add rule | — | ❌ | 🟡 | ❌ | ❌ |
| Remove / revoke key | P1 | 🟡 form | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Change-requests queue | P1 | 🟢 fixture | ❌ | ❌ | 🔒 need table | — | — | ❌ | 🟡 | ❌ | ❌ |
| Active/retired/history tabs | P1 | 🟢 | 🟡 stub | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Signer set health KPI | P1 | 🟢 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |

### Users (end users)

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| User list + search + filter | P1 | 🟢 | 🟡 stub | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Create user | P1 | 🟡 modal | 🟡 stub | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Invite user | P2 | 🟡 modal | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| User addresses per chain | P1 | 🟢 | 🟡 stub | ❌ | 🟢 | — | 🟡 HD derive | ❌ | 🟡 | ❌ | ❌ |
| User balances display | P1 | 🟢 fixture | ❌ | ❌ | 🟢 via ledger | — | — | ❌ | 🟡 | ❌ | ❌ |
| Risk scoring (manual) | P2 | 🟢 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| KYC tier update | P2 | 🟡 | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| User detail sheet | P1 | 🟢 | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |

### Transactions

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Unified tx log | P1 | 🟢 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Chain + type filter | P1 | 🟢 | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Tx detail sheet | P1 | 🟢 | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Explorer link | P1 | 🟢 | — | — | — | — | — | ❌ | — | ❌ | ❌ |
| Block number display | P1 | 🟢 | — | — | 🟢 | — | 🟡 via ledger | ❌ | — | ❌ | ❌ |

### Reconciliation

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Proof-of-reserves KPIs | P1 | 🟢 fixture | ❌ | ❌ | 🟢 | — | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Per-account drift | P1 | 🟢 fixture | ❌ | ❌ | 🟢 | — | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Chain vs ledger diff | P1 | ❌ | ❌ | ❌ | 🟢 | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| Export CSV | P2 | ❌ | ❌ | ❌ | 🟢 | — | — | ❌ | ❌ | ❌ | ❌ |

### Notifications

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| In-app notif panel | P1 | 🟢 fixture | ❌ | ❌ | 🔒 need table | — | — | ❌ | 🟡 | ❌ | ❌ |
| Channel toggles (Slack/email/SMS) | P1 | 🟢 | ❌ | ❌ | 🔒 | — | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Event-routing matrix | P1 | 🟢 | ❌ | ❌ | 🔒 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Slack webhook send | P1 | — | ❌ | ❌ | — | — | — | ❌ | — | ❌ | ❌ |
| Email send (SES) | P1 | — | ❌ | ❌ | — | — | — | ❌ | — | ❌ | ❌ |
| SMS send (Twilio) | P2 | — | ❌ | ❌ | — | — | — | ❌ | — | ❌ | ❌ |
| Send test | P1 | 🟡 modal | ❌ | ❌ | — | — | — | ❌ | 🟡 | ❌ | ❌ |

### Tx Errors / Recovery

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Failed tx list | P1 | 🟢 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Bump gas + retry | P1 | 🟡 | ❌ | ❌ | 🟢 | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Cancel pending | P1 | 🟡 | ❌ | ❌ | 🟢 | — | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Inspect reason | P1 | 🟢 | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |

### Dashboard

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AUM overview | P0 | 🟢 | 🟢 stub | 🟡 | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Pending counts (dep/sweep/wd) | P0 | 🟢 | 🟢 | 🟡 | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Live block sync | P0 | 🟢 fixture | ❌ | ❌ | — | — | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Gas prices live | P1 | 🟢 fixture | ❌ | ❌ | — | — | ❌ | ❌ | 🟡 | ❌ | ❌ |
| Recent activity feed | P1 | 🟢 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Alerts panel | P1 | 🟢 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| KPI sparklines | P2 | 🟢 | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |

### Cross-cutting Infrastructure

| Feature | P | Status | Notes |
|---|---|---|---|
| i18n EN+VI switcher | P0 | 🟢 | popover w/ checkmark, persisted Zustand |
| Theme (light/dark) | P0 | 🟢 | data-theme attr on html |
| Density (compact/comfy/cozy) | P1 | 🟢 | data-density attr |
| Accent palette (5 options) | P2 | 🟢 | via tweaks panel |
| Typography (sans/mono) | P1 | 🟢 | default mono match prototype |
| Command palette (⌘K) | P0 | 🟡 | nav only, no user/tx search yet |
| Notifications dropdown | P1 | 🟡 fixture | no backend notif store |
| User menu | P0 | 🟢 | logout wired |
| Env picker (staging/prod) | P1 | 🟡 UI only | no multi-env backend |
| Viewport responsiveness | P0 | 🟢 | 4 buckets (xs/sm/md/wide) |
| Mobile nav overlay | P1 | 🟢 | works <720px |
| Keyboard shortcuts (g+?) | P2 | ❌ | not ported |
| Docker compose local dev | P0 | 🟢 | postgres/redis/otel |
| OTel tracing | P1 | 🟡 wired | no collector → backend yet |
| Prom metrics | P1 | 🟡 exposed | no scrape target / dashboards |
| Sentry | P1 | 🟡 stub | no DSN configured |
| Pino / zerolog structured logs | P0 | 🟢 | with trace_id correlation |

### Architecture page (docs viewer)

| Feature | P | Status | Notes |
|---|---|---|---|
| Service map tab | P2 | 🟢 | 1:1 port from prototype |
| Lifecycle flows tab | P2 | 🟢 | |
| Sequence diagrams tab | P2 | 🟢 | |
| Domain model tab | P2 | 🟢 | |
| API surface tab | P2 | 🟢 | |
| Background jobs tab | P2 | 🟢 | |
| Security tab | P2 | 🟢 | |
| MVP plan tab | P2 | 🟢 | |

### Ops Extras

| Feature | P | Status | Notes |
|---|---|---|---|
| Emergency pause (all outbound) | P0 | ❌ | need kill-switch in policy engine + UI confirm |
| Rotate all keys (quarterly) | P1 | ❌ | manual runbook only |
| System health page | P1 | ❌ | /health/ready aggregate view |
| Backup trigger | P2 | ❌ | pg_dump → S3 |

---

## Priority summary (counts)

| Priority | 🟢 real | 🟡 stub/mock | ❌ not started | Total |
|---|---|---|---|---|
| **P0** | 14 | 22 | 16 | 52 |
| **P1** | 11 | 30 | 18 | 59 |
| **P2** | 2 | 8 | 7 | 17 |
| **P3** | 0 | 0 | 0 | 0 |
| **Cross-cutting** | 10 | 6 | 2 | 18 |

**Overall:** ~37 🟢 / 66 🟡 / 43 ❌ across ~146 feature-layer intersections.

---

## Recommended shipping order

Each slice = 1 plan folder in `plans/YYMMDD-HHMM-<slug>/` with acceptance criteria + phased tasks.

### Slice 0 — Unblock chain integration (must be first)

**Purpose:** without real wagmi/viem + Safe SDK + Squads SDK, NO P0 withdrawal/sweep slice can ship. This is the foundation.

- Install `wagmi@2`, `viem@2`, `@safe-global/protocol-kit`, `@sqds/multisig`, `@solana/wallet-adapter-*`
- Wire real `useSignTypedData` (EVM) + `signMessage` (Solana) in signing flow
- Keep mock mode behind `VITE_AUTH_DEV_MODE` toggle
- **Acceptance:** Treasurer connects MetaMask/Phantom, EIP-712 signature round-trips, console shows real signature bytes

### Slice 1 — Withdrawal end-to-end (P0, highest business value)

1. Create withdrawal → real validation + Policy pre-check
2. Multisig op creation (Safe or Squads)
3. Treasurer 1 approve → real EIP-712 sign → Safe Tx Service submit
4. Treasurer 2 approve → threshold reached → execute
5. Broadcast tx → confirmation track → ledger update → audit
6. UI shows live state changes via Socket.io
7. Full Playwright E2E test on testnet

### Slice 2 — Sweep execute (P0)

1. Sweep candidate scan (real HD derivation + RPC balance check)
2. Tx build (user_hd → hot_safe)
3. Policy pre-check (whitelisted sweep target)
4. Sign + broadcast
5. UI batch trigger + live status

### Slice 3 — Deposit real RPC (P0)

1. Block watcher poll real testnet RPC
2. Parse USDT/USDC Transfer logs → match HD addresses
3. BullMQ confirm → credit ledger (already wired)
4. Playwright E2E with testnet send → UI credited

### Slice 4 — Audit viewer real (P1)

1. `/audit-log` route returns paginated real rows
2. Hash-chain verification endpoint
3. Filter by staff/action/resource/date
4. Server-side CSV export
5. S3 audit export job (WORM bucket)

### Slice 5 — Notifications (P1)

1. Slack webhook service
2. Email SES service
3. Event → channel routing config in DB
4. Emit on: withdrawal approval, sweep complete, deposit credited, policy block

### Slice 6 — Signer ceremony + rotation (P1)

1. Onboarding: treasurer signs challenge → backend verifies → stores with `hw_attested` mark
2. Rotate key: request → 2/3 approval of change → swap address
3. Revoke key: instant with admin + audit

### Slice 7 — Cold rebalance + high-value withdrawal (P0-ish)

1. Cold address real balance (RPC check)
2. Rebalance proposal (hot → cold, intra-custody whitelist bypass)
3. Cold → outside withdrawal (48h time-lock UI countdown + auto-execute on expiry)
4. HW-attested enforcement verified

### Slice 8 — User management real (P1)

1. Create user endpoint → insert + trigger HD derivation for all chains
2. Update KYC tier with audit
3. User balance via real ledger query
4. Address list per user

### Slice 9 — Ops emergency controls (P0)

1. Kill-switch: pause all outbound transfers (DB flag + policy engine check)
2. System health aggregate page
3. Rotate all keys runbook

### Slice 10 — Reconciliation (P1)

1. Chain state snapshot job (daily per multisig)
2. Diff vs ledger
3. Alert if drift > threshold

### Slice 11 — Recovery flow (P1)

1. Failed tx list from DB
2. Bump gas endpoint (rebroadcast with higher gas)
3. Cancel endpoint (replace with 0 tx if possible)

### Slice 12 — Infrastructure hardening (parallel to slices)

1. Real AWS IaC (Terraform for VPC/RDS/ECS/ALB/CloudFront)
2. OTel collector → Grafana Cloud or self-hosted
3. Alert rules (withdrawal latency > X, audit write fail, etc.)
4. Penetration test + security audit
5. Playwright visual regression baseline + CI integration

---

## Definition of Done (per feature slice)

Before marking a feature 🟢, the slice author MUST:

- [ ] All applicable layer cells in this matrix are 🟢 (not 🟡)
- [ ] Playwright E2E passes on happy path
- [ ] Unit tests ≥ 80% coverage on service + policy rule
- [ ] OpenAPI doc regenerated from Zod schemas
- [ ] OTel span visible in local collector
- [ ] Pino log structured with `trace_id`, `feature`, `staff_id`, `action`
- [ ] Audit event emitted with correct `resource_type` + `resource_id`
- [ ] i18n keys exist in both `en.json` and `vi.json`
- [ ] Runbook written in `docs/runbooks/<feature>.md` if flow has manual steps (key ceremony, pause, etc.)
- [ ] This matrix updated with new 🟢 cells
- [ ] 1 commit series with conventional scope, ending with `feat(<feature>): slice complete`

---

## How to use this document

1. **Before a planning session:** read this, pick next slice from "Recommended shipping order"
2. **During planning:** create `plans/YYMMDD-HHMM-<feature-slug>/plan.md` with acceptance criteria = DoD above
3. **During implementation:** every commit message notes which layer cells moved from 🟡/❌ → 🟢
4. **After slice complete:** update this matrix (status symbols + priority totals), commit `docs(feature-matrix): slice N done`
5. **At review time:** a cell stays 🟡 or ❌ if it's not proven end-to-end. Lying in this doc breaks the methodology.

---

## Unresolved / open questions

1. **Safe multisig vs Squads**: UI architecture split per chain clear. But **withdrawal detail schema** needs clarification — one `multisig_ops` table with `chain` discriminator, or two tables? (Current: one table, works for both)
2. **TOTP**: any treasurer actually need it, or is WebAuthn+YubiKey mandatory? If not needed, drop from P1.
3. **Ledger Live vs WalletConnect**: Ledger Nano X signing goes through MetaMask (Desktop) or direct (Live)? Affects wagmi connector config.
4. **Env picker (staging/prod)**: is this one deployed backend per env, or a header the frontend sends to one backend? Architecture impact.
5. **Slack webhook only vs Slack app**: for P1 notifications, a single webhook is 1 day; full Slack app with OAuth is 1 week.
6. **Reconciliation trigger**: daily cron, or on-demand button, or both?
7. **Chain expansion**: current matrix assumes BNB+Solana only. When Ethereum mainnet arrives, this matrix 1.5x.
8. **HSM path**: prototype architecture mentions "Vault / KMS". Is this post-MVP? If yes, cold tier stays on Ledger HW forever?
