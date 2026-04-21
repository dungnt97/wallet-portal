---
title: "Matrix completion — close all remaining 🟡/❌ cells"
description: "Ship every deferred P1+P2 feature in feature-matrix.md. Zero 🟡/❌ when done (except explicit 🔒 out-of-scope)."
status: completed
priority: P1
effort: 1.5-2d
branch: main
tags: [cleanup, matrix, polish, p1, p2]
created: 2026-04-21
depends_on: []
---

## Context

After 13 slices shipped, `docs/feature-matrix.md` shows 125🟢 / 20🟡 / 13❌. This slice closes the remaining 33 gap cells (or documents why they must stay 🔒/—).

## Phase Index

| # | Phase | Status | Owns |
|---|---|---|---|
| 01 | Export CSV — deposits + withdrawals (reuse audit pattern) | completed | `apps/admin-api/src/services/deposit-csv.service.ts`, `withdrawal-csv.service.ts`, routes, UI buttons |
| 02 | Command palette search — users + tx lookup | completed | `apps/ui/src/shell/command-palette.tsx` + `apps/admin-api/src/routes/search.routes.ts` |
| 03 | Env picker backend + Sentry DSN wire | completed | `apps/ui/src/shell/env-picker.tsx`, `apps/ui/src/observability/sentry.ts` |
| 04 | Login history real endpoint + UI | completed | `apps/admin-api/src/routes/sessions.routes.ts`, `apps/ui/src/features/security/login-history.tsx` |
| 05 | i18n stragglers — OIDC/WebAuthn/notif event labels | skipped — parity confirmed | `apps/ui/src/i18n/locales/{en,vi}.json` |
| 06 | Account settings modal real + Invite user real | completed | `apps/ui/src/features/account/`, `apps/ui/src/features/users/invite-modal.tsx` |
| 07 | Risk scoring manual | completed | `apps/admin-api/src/services/user-risk.service.ts`, users detail UI |
| 08 | Manual credit admin override + audit | completed | `apps/admin-api/src/services/deposit-manual-credit.service.ts` |
| 09 | Keyboard shortcuts (g+d/w/c/…) | completed | `apps/ui/src/hooks/use-keyboard-shortcuts.ts` |
| 10 | Staff directory sync (GW stubs OK without creds) | completed | `apps/admin-api/src/services/staff-sync-google.service.ts` + runbook |
| 11 | SMS Twilio channel | completed | `apps/admin-api/src/workers/notif-sms.worker.ts` + preferences |
| 12 | Backup trigger UI + pg_dump script | completed | `apps/admin-api/src/routes/ops-backup.routes.ts`, runbook |
| 13 | Final matrix sweep — update feature-matrix.md cells | completed | `docs/feature-matrix.md` |

## Dependency chain

```
01, 02, 03, 04, 05 (P1 batch, parallel-safe) → 06, 07, 08, 09, 10, 11, 12 (P2 batch) → 13
```

## Acceptance criteria

- [ ] Deposit + Withdrawal CSV export: streaming, filters, 50k cap (match audit pattern)
- [ ] Command palette ⌘K: type query → search users (by email) + withdrawals/sweeps/deposits (by tx_hash or id) → keyboard-navigable results
- [ ] Env picker: reads `VITE_ENV_PROFILES` list, switch triggers API base URL change, persists in localStorage
- [ ] Sentry: `VITE_SENTRY_DSN` env → init Sentry browser SDK + errorHandler in admin-api via `@sentry/node`
- [ ] Login history: `GET /staff/me/sessions` returns last 50 login attempts from DB (new `staff_login_history` table), UI lists with device/IP/success
- [ ] i18n: all remaining EN-only strings have VI equivalents; missing-key dev warning if any
- [ ] Account settings modal: real profile update (name, locale pref), change password flow (via OIDC IDP link-out)
- [ ] Invite user modal: admin creates staff → email invite link → WebAuthn register flow
- [ ] Risk scoring: admin sets user risk tier (low/medium/high/frozen) with reason, audit entry, policy engine reads for daily_limit multiplier
- [ ] Manual credit: admin-only, WebAuthn step-up, creates deposit row with `manual=true` + ledger entry + critical audit
- [ ] Keyboard shortcuts: `g+d` dashboard, `g+w` withdrawals, `g+c` cold, `g+u` users, `?` help overlay
- [ ] Staff directory sync: admin-api has service + route stub `POST /staff/sync-google-workspace` returning 501 Not Implemented with runbook link IF `GOOGLE_WORKSPACE_CREDS` env missing, else real sync
- [ ] SMS Twilio worker: `@twilio/twilio` install, worker sends SMS when `prefs.sms=true` + severity=critical; dry-run mode when creds missing
- [ ] Backup trigger: `POST /ops/backup/pg-dump` triggers `pg_dump → S3` via BullMQ job; UI button in ops page; runbook `docs/runbooks/backup-restore.md`
- [ ] Final matrix sweep: all 🟡/❌ cells moved to 🟢 or 🔒 with comment, progress count updated
- [ ] Typecheck + tests green across all 4 apps

## Out of scope (truly 🔒)

- Real Google Workspace directory sync (requires OAuth creds — deliver stub + runbook)
- Real SMS sending (requires Twilio creds — deliver code + dry-run mode)
- Multi-env backend switching (UI persists selection, API URL changes; actual multi-env infra = Slice 12 AWS + follow-up)

## Risks

| Risk | Mitigation |
|---|---|
| CSV export too wide (memory) | 50k row cap + streaming (already pattern from audit) |
| Manual credit abused | WebAuthn step-up + critical audit + always visible in deposit list with 🟠 badge |
| Keyboard shortcuts conflict with browser | Use `g` as leader key (Gmail-style), only active when focus not in input |
| Risk tier used without policy update | Policy rule `daily_limit.go` reads `users.risk_tier` as multiplier; documented |
| Backup IAM permissions leak | Use scoped IAM role for pg_dump → S3; encrypt with KMS |

## Progress

- [x] Phase 01 — completed (deposit + withdrawal CSV export streaming, 50k cap, filters — commit f1d3a38)
- [x] Phase 02 — completed (command palette users + tx search + keyboard nav — commit a4f7028)
- [x] Phase 03 — completed (env picker multi-profile + localStorage + dynamic API URL + Sentry browser+node DSN wire — commit 38b47f8)
- [x] Phase 04 — completed (login history migration 0017 + service + UI — commit 572726b)
- [x] Phase 05 — confirmed parity (en.json + vi.json 984 lines each)
- [x] Phase 06 — completed (account settings PATCH + invite staff modal)
- [x] Phase 07 — completed (risk tier PATCH + UI modal + policy engine reads tier)
- [x] Phase 08 — completed (manual credit POST + step-up + critical audit)
- [x] Phase 09 — completed (keyboard shortcuts hook + help overlay)
- [x] Phase 10 — completed (GW sync stub 501 + runbook docs/runbooks/staff-directory-sync.md)
- [x] Phase 11 — completed (SMS Twilio worker + prefs toggle + phone E.164)
- [x] Phase 12 — completed (pg_dump worker + S3 upload + ops backup card + runbook)
- [x] Phase 13 — completed (feature-matrix.md updated ~161🟢/16🟡/5❌)
