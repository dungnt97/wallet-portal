# Security Audit Checklist

**Owner:** @ops  
**Reviewed:** 2026-04-21  
**Re-review cadence:** Every quarterly release  
**Responsible disclosure contact:** security@treasury.io

---

## Scope Definition

Externally-exposed attack surfaces:

| Surface | Description |
|---------|-------------|
| Admin UI | React SPA served via CloudFront; authenticated staff only |
| admin-api | REST API on ALB (HTTPS); all endpoints require session JWT |
| Webhook receivers | `/webhooks/rpc-notify`, `/webhooks/blockchain-event` on admin-api |
| WebAuthn endpoints | `/auth/webauthn/register`, `/auth/webauthn/authenticate` |
| OIDC callback | `/auth/callback` — receives Google OIDC code |

Out of scope: internal ALB (wallet-engine, policy-engine) — not internet-routable; AWS management console; third-party RPC provider infrastructure.

---

## Preflight Hardening Verification

Run this checklist before scheduling an external pentest. Each item must be answerable with evidence (config file, AWS console screenshot, or `curl` output).

### Authentication & Session

- [ ] Rate limiting on all auth endpoints (`/auth/session/initiate`, `/auth/webauthn/authenticate`, `/auth/callback`) — 10 req/min per IP
- [ ] Session cookies: `Secure`, `HttpOnly`, `SameSite=Strict` flags set
- [ ] JWT expiry ≤ 15 minutes for access tokens; refresh via session cookie only
- [ ] WebAuthn step-up required on: withdrawal creation, sweep execution, signer add/remove, config update, emergency kill-switch toggle
- [ ] OIDC state parameter validated on `/auth/callback` (CSRF protection)
- [ ] No session fixation: session ID rotated on successful login

### Transport & Headers

- [ ] HTTPS only — HTTP 301 redirect to HTTPS on ALB and CloudFront
- [ ] HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- [ ] CSP header covers: `default-src 'self'`; `script-src 'self'`; no `unsafe-inline` / `unsafe-eval`
- [ ] CORS allowlist limited to `portal.{domain}` — no `*` origin
- [ ] `X-Frame-Options: DENY` or `frame-ancestors 'none'` in CSP
- [ ] `X-Content-Type-Options: nosniff`
- [ ] Referrer-Policy: `strict-origin-when-cross-origin`

### Secrets & Configuration

- [ ] All secrets in Secrets Manager (no hardcoded values, no `.env` in git)
- [ ] `.env` in `.gitignore` and confirmed absent from git history (`git log --all -- '*.env'`)
- [ ] `gitleaks detect` on full repo history returns 0 findings
- [ ] HD_MASTER_SEED stored in Secrets Manager with CloudTrail access logs enabled
- [ ] IAM task roles: per-service, no `*` actions, no `*` resources (verify via `aws iam simulate-principal-policy`)
- [ ] DB connection over TLS (`rds.force_ssl=1` param group confirmed)

### Authorization (RBAC)

- [ ] Every admin-api route has explicit role check (no unauthenticated route returns data)
- [ ] RBAC matrix matches `auth-provider.tsx` PERMS table — no role creep
- [ ] Treasurer-only: withdrawal approve, multisig sign
- [ ] Admin-only: staff manage, config update, kill-switch toggle
- [ ] Viewer cannot trigger any state-mutating operation (POST/PUT/DELETE returns 403)

### Data Integrity & Audit

- [ ] Audit log immutability: DB trigger prevents `UPDATE` and `DELETE` on `audit_log` table
- [ ] All sensitive operations emit an audit log entry (verify via integration test or manual test)
- [ ] Audit log entries include: actor, IP, user-agent, timestamp, action, subject

### Kill-Switch & Policy Engine

- [ ] Kill-switch pauses all outbound transactions (withdrawals + sweeps)
- [ ] Policy engine fail-closed: if unreachable, admin-api rejects withdrawal requests (verify by stopping policy-engine container)
- [ ] Kill-switch toggle requires WebAuthn step-up + admin role

### Multisig / Signer Ceremony

- [ ] 2-of-3 signer threshold enforced at smart-contract level — no admin override path
- [ ] Emergency bump/cancel requires both: admin role + WebAuthn step-up
- [ ] Signer keys never leave hardware wallet / Squads vault

### Infrastructure

- [ ] ECR scan-on-push enabled on all 3 repos; no CRITICAL/HIGH unpatched CVEs
- [ ] `trivy image <image>` run before each production deploy
- [ ] `tfsec infra/aws/` — zero HIGH severity findings
- [ ] `checkov -d infra/aws/` — zero HIGH severity findings
- [ ] CloudFront WAF: AWS managed core rule set active
- [ ] ALB access logs enabled, 90-day S3 retention
- [ ] CloudTrail enabled, all regions, S3 + CloudWatch

---

## Threat Model (STRIDE per Service)

### admin-api

| Threat | STRIDE | Risk | Control |
|--------|--------|------|---------|
| Attacker replays stolen JWT | Spoofing | H | Short expiry (15m) + session cookie binding |
| Staff escalates own role via API | Elevation of privilege | H | Role stored in DB, not JWT; only admin can mutate |
| Audit log tampered post-incident | Tampering | H | DB trigger + Secrets Manager access log |
| Withdrawal data leaked to wrong staff | Info disclosure | M | RBAC on all GET routes |
| Flood `/auth/webauthn/authenticate` | DoS | M | Rate limit 10/min per IP |
| OIDC callback CSRF | Spoofing | H | `state` parameter validated; SameSite=Strict cookie |

### wallet-engine

| Threat | STRIDE | Risk | Control |
|--------|--------|------|---------|
| HD master seed extracted from memory | Info disclosure | C | Seed in Secrets Manager; ECS task memory not swapped |
| RPC provider substitution (MitM) | Tampering | H | Pinned RPC endpoints; TLS verified |
| Sweep to attacker-controlled address | Tampering | H | Address must be in pre-approved whitelist |
| Replay of signed transaction | Tampering | H | Nonce + chain ID in every transaction |

### policy-engine

| Threat | STRADA | Risk | Control |
|--------|--------|------|---------|
| Bypass policy check | Elevation of privilege | C | Fail-closed; admin-api blocks if unreachable |
| Rule tampering via config update | Tampering | H | Config update requires admin role + WebAuthn |
| Policy engine crash = silent pass | DoS / Elevation | C | Fail-closed enforced in admin-api middleware |

---

## Vendor Selection Criteria

Preferred pentest vendors (Web3/custody experience required):

- Trail of Bits — EVM smart contracts + backend
- Cure53 — web app + browser security
- Kudelski Security — HSM + key management
- Local APAC firm (TBD) — for regulatory / on-site requirements

**Deliverables required from vendor:**
1. Written findings report (CVSS-scored, reproducible PoC per finding)
2. Remediation walk-through session (30-60 min)
3. Re-test of all Critical + High findings after remediation
4. NDA signed before environment access

---

## Artifact Handoff to Pentester

Provide these documents to the pentester at engagement start:

- [ ] `docs/system-architecture.md` — system design diagram
- [ ] `docs/runbooks/pentest-scope-template.md` — in-scope endpoints, test accounts
- [ ] OpenAPI export: `curl http://localhost:3001/api-docs/json > openapi.json` (or admin-api route list)
- [ ] Infrastructure diagram (Terraform outputs: ALB DNS, CF distribution)
- [ ] Staging environment URL + credentials (isolated from prod)
- [ ] Rate-limit bypass token (so pentester isn't blocked by their own scans)

---

## Remediation SLAs

| Severity | Patch deadline | Re-test required |
|----------|---------------|-----------------|
| Critical | 48 hours | Yes — by pentester |
| High | 7 days | Yes — by pentester |
| Medium | 30 days | Internal QA |
| Low | Next quarterly release | Internal QA |

All Critical and High findings must be re-validated by the pentester before the engagement closes.

---

## Dependency Audit

Run dependency vulnerability scan before engaging pentester:

```bash
# JavaScript / TypeScript (all packages)
pnpm audit --audit-level high

# Go (policy-engine)
cd apps/policy-engine
go list -m -json all | nancy sleuth
```

See `docs/runbooks/cve-triage-sla.md` for triage and remediation workflow.
Automated weekly scan: `.github/workflows/dep-audit.yml`

---

## OWASP Top-10 Coverage

| # | Risk | Control in place |
|---|------|-----------------|
| A01 | Broken Access Control | RBAC on all routes; PERMS matrix in auth-provider |
| A02 | Cryptographic Failures | TLS everywhere; AES-256 at rest (RDS + S3); no MD5/SHA1 |
| A03 | Injection | Zod validation on all request bodies; Prisma parameterised queries |
| A04 | Insecure Design | Threat model above; fail-closed policy engine |
| A05 | Security Misconfiguration | `tfsec` + `checkov` in CI; CSP + HSTS headers |
| A06 | Vulnerable Components | `pnpm audit` weekly; ECR scan-on-push; `trivy` pre-deploy |
| A07 | Authentication Failures | WebAuthn + OIDC; rate limiting; session cookie flags |
| A08 | Software Integrity Failures | `pnpm install --frozen-lockfile`; ECR image signing (planned) |
| A09 | Logging & Monitoring Failures | Audit log + CloudTrail + Prometheus alerts |
| A10 | SSRF | No user-controlled URLs in server-side HTTP calls |

---

## Disclosure Policy

Responsible disclosure: **security@treasury.io**  
Response SLA: 5 business days acknowledgement, 90 days coordinated disclosure window.  
Bug bounty program: TBD (post-launch).
