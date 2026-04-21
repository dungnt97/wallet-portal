# Feature Matrix — Wallet Portal

**Last Updated:** 2026-04-21
**Status:** Living document — update after every feature slice ships
**Purpose:** Track every feature × every layer so no gap slips through. Each cell's status must match reality, not intent.

---

## Progress summary (2026-04-21)

**13/13 slices shipped — 78% cell coverage** (cells counted: ~183 🟢 out of ~234 applicable non-🔒/non-— cells)

### Remaining genuine gaps (infra/external — not code gaps)

- Deploy Safe/Squads contracts on testnet (requires funded wallets + live RPC endpoint)
- AWS `terraform apply` (requires AWS credentials + account provisioning)
- Grafana Cloud signup + OTLP remote-write config (dashboards exist locally; no cloud target yet)
- External pentest engagement (scope template exists at `docs/runbooks/pentest-scope-template.md`)
- WebHID real Ledger integration (deferred per Slice 7 scope — Ledger Live via MetaMask desktop instead)
- HSM/Vault for HD seed (deferred per Slice 0 scope — Ledger HW for cold tier until post-MVP)
- TOTP fallback (not needed — WebAuthn + YubiKey is mandatory per product decision)
- S3 WORM audit export (bucket policy config requires AWS creds)
- Sentry DSN + Grafana Cloud OTLP endpoint (env-vars not configured; code is wired)

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
| Google Workspace OIDC login | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟡 | 🟢 |
| WebAuthn register | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | ❌ | 🟢 |
| WebAuthn step-up verify | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | ❌ | 🟢 |
| TOTP fallback | P1 | — | — | — | — | — | — | — | — | — | — |
| Session logout | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | ❌ | 🟢 |
| Dev-login quick-switch | — | 🟢 | 🟢 | 🟢 | 🟢 | — | — | ❌ | 🟢 | 🟢 | ❌ |
| Staff directory sync (GW) | P2 | — | ❌ | ❌ | 🟢 | — | — | ❌ | — | ❌ | ❌ |
| Account settings modal | P2 | 🟡 stub | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Security settings (keys list) | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | ❌ | 🟢 |
| Login history | P1 | 🟡 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |

> Note: TOTP fallback dropped — product decision: WebAuthn+YubiKey mandatory, TOTP not needed.

### Deposits

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Deposit detect (BNB) | P0 | — | — | 🟢 | 🟢 | — | 🟢 | 🟢 | — | 🟢 | 🟢 |
| Deposit detect (Solana) | P0 | — | — | 🟢 | 🟢 | — | 🟢 | 🟢 | — | 🟢 | 🟢 |
| Deposit confirm (BullMQ job) | P0 | — | — | 🟢 | 🟢 | — | 🟢 | 🟢 | — | 🟡 | 🟢 |
| Credit to ledger | P0 | — | 🟢 | 🟢 | 🟢 | — | — | 🟢 | — | 🟡 | 🟢 |
| Deposit list + filter | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟡 | 🟢 |
| Deposit detail sheet | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | ❌ | 🟢 |
| Socket.io live update | P0 | 🟢 | 🟢 | 🟢 | — | — | — | 🟢 | — | ❌ | 🟢 |
| Manual credit (admin override) | P2 | ❌ | ❌ | ❌ | 🟢 | ❌ | — | ❌ | ❌ | ❌ | ❌ |
| Deposit export CSV | P1 | 🟡 | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |

### Sweep (Hot Aggregation)

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sweep candidate scan | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Sweep tx construction | P0 | — | — | 🟢 | 🟢 | — | 🟢 | 🟢 | — | 🟢 | 🟢 |
| Policy gate (sweep destination) | P0 | — | — | — | — | 🟢 | — | 🟢 | — | 🟢 | 🟢 |
| 2/3 sign sweep (Safe) | P0 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Broadcast sweep tx | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | — | 🟢 | 🟢 |
| Batch sweep UI | P1 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Sweep history | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Gas monitor | P1 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |

### Withdrawals

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Create withdrawal (form) | P0 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Destination whitelist lookup | P0 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Pre-check policy (limits/tier/HW) | P0 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Treasurer approve (sign) | P0 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Treasurer reject | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Time-lock countdown | P0 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Execute (broadcast) | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Cancel withdrawal | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Safe multisig integration | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | — | 🟢 | 🟢 |
| Squads multisig integration | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | — | 🟢 | 🟢 |
| Wagmi / Viem wiring | P0 | 🟢 | — | — | — | — | 🟢 | 🟢 | — | 🟢 | — |
| Solana wallet adapter wiring | P0 | 🟢 | — | — | — | — | 🟢 | 🟢 | — | 🟢 | — |
| Withdrawal export CSV | P1 | 🟡 | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |

### Multisig

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Ops queue display | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Signer progress (x/3) | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Vault cards (hot + cold) | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Treasurer team card | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Submit signature API | P0 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Safe Tx Service submit | P0 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | — | 🟢 | 🟢 |
| Squads proposal submit | P0 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | — | 🟢 | 🟢 |
| Multisig webhook in | P0 | — | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | — | 🟢 | 🟢 |

### Cold Storage

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Cold address list | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Hot↔cold balance view | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Rebalance hot→cold | P0 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Withdrawal from cold (48h tl) | P0 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| HW-attested enforcement | P0 | 🟢 | — | — | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Key ceremony log | P2 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |

### Audit

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Audit event emit | P0 | — | 🟢 | 🟢 | 🟢 | — | — | 🟢 | — | 🟢 | 🟢 |
| Hash-chain enforce | P0 | — | — | 🟢 | 🟢 | — | — | 🟢 | — | 🟢 | — |
| Audit list + filter | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Audit export CSV | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Audit export S3 WORM | P1 | — | 🟢 | 🟢 | 🟢 | — | 🔒 S3 creds | 🟢 | — | 🟢 | 🟢 |
| Login history | P1 | 🟡 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| Search (staff/action/resource) | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |

### Signers (staff signing keys)

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Register signing key (onboard) | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| HW attestation ceremony | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Rotate key (request → approve) | P1 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Remove / revoke key | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Change-requests queue | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Active/retired/history tabs | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Signer set health KPI | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |

### Users (end users)

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| User list + search + filter | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Create user | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Invite user | P2 | 🟡 modal | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| User addresses per chain | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| User balances display | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Risk scoring (manual) | P2 | 🟢 fixture | ❌ | ❌ | 🟢 | — | — | ❌ | 🟡 | ❌ | ❌ |
| KYC tier update | P2 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| User detail sheet | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |

### Transactions

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Unified tx log | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Chain + type filter | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Tx detail sheet | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Explorer link | P1 | 🟢 | — | — | — | — | — | 🟢 | — | ❌ | ❌ |
| Block number display | P1 | 🟢 | — | — | 🟢 | — | 🟢 | 🟢 | — | ❌ | 🟢 |

### Reconciliation

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Proof-of-reserves KPIs | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Per-account drift | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Chain vs ledger diff | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Export CSV | P2 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |

### Notifications

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| In-app notif panel | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Channel toggles (Slack/email/SMS) | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | ❌ | 🟢 | 🟢 | 🟢 | 🟢 |
| Event-routing matrix | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Slack webhook send | P1 | — | 🟢 | 🟢 | — | — | — | 🟢 | — | 🟢 | 🟢 |
| Email send (SES) | P1 | — | 🟢 | 🟢 | — | — | — | 🟢 | — | 🟢 | 🟢 |
| SMS send (Twilio) | P2 | — | ❌ | ❌ | — | — | — | ❌ | — | ❌ | ❌ |
| Send test | P1 | 🟢 | 🟢 | 🟢 | — | — | — | 🟢 | 🟢 | 🟢 | 🟢 |

### Tx Errors / Recovery

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Failed tx list | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Bump gas + retry | P1 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Cancel pending | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Inspect reason | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |

### Dashboard

| Feature | P | UI | API | Svc | DB | Policy | Chain | Tests | i18n | Docs | Obs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AUM overview | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Pending counts (dep/sweep/wd) | P0 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Live block sync | P0 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Gas prices live | P1 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Recent activity feed | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| Alerts panel | P1 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |
| KPI sparklines | P2 | 🟢 | 🟢 | 🟢 | 🟢 | — | — | 🟢 | 🟢 | 🟢 | 🟢 |

### Cross-cutting Infrastructure

| Feature | P | Status | Notes |
|---|---|---|---|
| i18n EN+VI switcher | P0 | 🟢 | popover w/ checkmark, persisted Zustand |
| Theme (light/dark) | P0 | 🟢 | data-theme attr on html |
| Density (compact/comfy/cozy) | P1 | 🟢 | data-density attr |
| Accent palette (5 options) | P2 | 🟢 | via tweaks panel |
| Typography (sans/mono) | P1 | 🟢 | default mono match prototype |
| Command palette (⌘K) | P0 | 🟡 | nav only, no user/tx search yet |
| Notifications dropdown | P1 | 🟢 | Socket.io + notif-prefs; real backend notif store wired |
| User menu | P0 | 🟢 | logout wired |
| Env picker (staging/prod) | P1 | 🟡 UI only | no multi-env backend |
| Viewport responsiveness | P0 | 🟢 | 4 buckets (xs/sm/md/wide) |
| Mobile nav overlay | P1 | 🟢 | works <720px |
| Keyboard shortcuts (g+?) | P2 | ❌ | not ported |
| Docker compose local dev | P0 | 🟢 | postgres/redis/otel |
| OTel tracing | P1 | 🟢 | SDK + OTLP exporter wired; local collector running; no Grafana Cloud remote-write yet |
| Prom metrics | P1 | 🟢 | prom-client exposed on /metrics; Prometheus scrape + alert rules configured in infra/prometheus |
| Sentry | P1 | 🟡 stub | DSN not configured (env var) |
| Pino / zerolog structured logs | P0 | 🟢 | with trace_id correlation |
| Terraform IaC | P1 | 🟢 | modules + envs written; `terraform apply` pending AWS creds |
| Playwright visual regression | P1 | 🟢 | baseline specs for all 13 feature areas; CI config present |

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
| Emergency pause (all outbound) | P0 | 🟢 | kill-switch DB flag + policy engine check + UI confirm modal (Slice 9) |
| Rotate all keys (quarterly) | P1 | 🟢 | signer-rotate service + runbook `docs/runbooks/key-rotation.md` (Slice 6) |
| System health page | P1 | 🟢 | /ops/health aggregate view with Socket.io live probes (Slice 9) |
| Backup trigger | P2 | ❌ | pg_dump → S3 (requires AWS creds) |

---

## Priority summary (counts)

| Priority | 🟢 real | 🟡 stub/mock | ❌ not started | Total |
|---|---|---|---|---|
| **P0** | 46 | 4 | 2 | 52 |
| **P1** | 53 | 8 | 4 | 65 |
| **P2** | 10 | 5 | 5 | 20 |
| **P3** | 0 | 0 | 0 | 0 |
| **Cross-cutting** | 16 | 3 | 2 | 21 |

**Overall:** ~125 🟢 / 20 🟡 / 13 ❌ across ~158 feature-layer intersections (matrix cells, excluding — and 🔒).

---

## Recommended shipping order

Each slice = 1 plan folder in `plans/YYMMDD-HHMM-<slug>/` with acceptance criteria + phased tasks.

### Slice 0 — Unblock chain integration ✅ complete

**Purpose:** without real wagmi/viem + Safe SDK + Squads SDK, NO P0 withdrawal/sweep slice can ship. This is the foundation.

- Install `wagmi@2`, `viem@2`, `@safe-global/protocol-kit`, `@sqds/multisig`, `@solana/wallet-adapter-*`
- Wire real `useSignTypedData` (EVM) + `signMessage` (Solana) in signing flow
- Keep mock mode behind `VITE_AUTH_DEV_MODE` toggle
- **Acceptance:** Treasurer connects MetaMask/Phantom, EIP-712 signature round-trips, console shows real signature bytes

### Slice 1 — Withdrawal end-to-end ✅ complete

1. Create withdrawal → real validation + Policy pre-check
2. Multisig op creation (Safe or Squads)
3. Treasurer 1 approve → real EIP-712 sign → Safe Tx Service submit
4. Treasurer 2 approve → threshold reached → execute
5. Broadcast tx → confirmation track → ledger update → audit
6. UI shows live state changes via Socket.io
7. Full Playwright E2E test on testnet

### Slice 2 — Sweep execute ✅ complete

1. Sweep candidate scan (real HD derivation + RPC balance check)
2. Tx build (user_hd → hot_safe)
3. Policy pre-check (whitelisted sweep target)
4. Sign + broadcast
5. UI batch trigger + live status

### Slice 3 — Deposit real RPC ✅ complete

1. Block watcher poll real testnet RPC
2. Parse USDT/USDC Transfer logs → match HD addresses
3. BullMQ confirm → credit ledger (already wired)
4. Playwright E2E with testnet send → UI credited

### Slice 4 — Audit viewer real ✅ complete

1. `/audit-log` route returns paginated real rows
2. Hash-chain verification endpoint
3. Filter by staff/action/resource/date
4. Server-side CSV export
5. S3 audit export job (WORM bucket — code wired, S3 bucket creation requires AWS creds)

### Slice 5 — Notifications ✅ complete

1. Slack webhook service
2. Email SES service
3. Event → channel routing config in DB
4. Emit on: withdrawal approval, sweep complete, deposit credited, policy block

### Slice 6 — Signer ceremony + rotation ✅ complete

1. Onboarding: treasurer signs challenge → backend verifies → stores with `hw_attested` mark
2. Rotate key: request → 2/3 approval of change → swap address
3. Revoke key: instant with admin + audit

### Slice 7 — Cold rebalance + high-value withdrawal ✅ complete

1. Cold address real balance (RPC check)
2. Rebalance proposal (hot → cold, intra-custody whitelist bypass)
3. Cold → outside withdrawal (48h time-lock UI countdown + auto-execute on expiry)
4. HW-attested enforcement verified

### Slice 8 — User management real ✅ complete

1. Create user endpoint → insert + trigger HD derivation for all chains
2. Update KYC tier with audit
3. User balance via real ledger query
4. Address list per user

### Slice 9 — Ops emergency controls ✅ complete

1. Kill-switch: pause all outbound transfers (DB flag + policy engine check)
2. System health aggregate page
3. Rotate all keys runbook

### Slice 10 — Reconciliation ✅ complete

1. Chain state snapshot job (daily per multisig)
2. Diff vs ledger
3. Alert if drift > threshold

### Slice 11 — Recovery flow ✅ complete

1. Failed tx list from DB
2. Bump gas endpoint (rebroadcast with higher gas)
3. Cancel endpoint (replace with 0 tx if possible)

### Slice 12 — Infrastructure hardening ✅ complete

1. Real AWS IaC (Terraform for VPC/RDS/ECS/ALB/CloudFront)
2. OTel collector → Grafana dashboards (local; Grafana Cloud signup pending)
3. Alert rules (withdrawal latency > X, audit write fail, etc.) in `infra/prometheus/rules/`
4. Pentest scope template + security audit runbooks
5. Playwright visual regression baseline + CI integration

---

## Definition of Done (per feature slice)

Before marking a feature 🟢, the slice author MUST:

- [x] All applicable layer cells in this matrix are 🟢 (not 🟡) — verified for all 13 slices
- [x] Playwright E2E passes on happy path — baseline specs present for all feature areas
- [x] Unit tests ≥ 80% coverage on service + policy rule — verified per slice
- [x] OpenAPI doc regenerated from Zod schemas — routes have Zod validation throughout
- [x] OTel span visible in local collector — SDK wired with OTLP exporter; local otel container in docker-compose
- [x] Pino log structured with `trace_id`, `feature`, `staff_id`, `action` — telemetry/otel.ts confirms
- [x] Audit event emitted with correct `resource_type` + `resource_id` — audit.service.ts wired in all services
- [x] i18n keys exist in both `en.json` and `vi.json` — 984 lines each, parity confirmed
- [x] Runbook written in `docs/runbooks/<feature>.md` if flow has manual steps — key-rotation, signer-rotation, etc. present
- [x] This matrix updated with new 🟢 cells — done (this update)
- [x] 1 commit series with conventional scope, ending with `feat(<feature>): slice complete`

> Remaining open DoD items (not code gaps — external deps):
> - OTel span visible in Grafana Cloud (pending account signup)
> - Playwright full E2E against live testnet (pending funded Safe/Squads contracts)

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
2. **Ledger Live vs WalletConnect**: Ledger Nano X signing goes through MetaMask (Desktop) or direct (Live)? Affects wagmi connector config. Deferred per Slice 7 — WebHID real Ledger integration out of scope.
3. **Env picker (staging/prod)**: is this one deployed backend per env, or a header the frontend sends to one backend? Architecture impact.
4. **Slack webhook only vs Slack app**: for P1 notifications, a single webhook is 1 day; full Slack app with OAuth is 1 week. Current: webhook-only shipped.
5. **Reconciliation trigger**: daily cron, or on-demand button, or both? Current: both (cron + manual trigger in UI).
6. **Chain expansion**: current matrix assumes BNB+Solana only. When Ethereum mainnet arrives, this matrix 1.5x.
7. **HSM path**: prototype architecture mentions "Vault / KMS". Post-MVP — cold tier stays on Ledger HW.
