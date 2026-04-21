# Secrets Rotation Runbook

**Owner:** @ops (dual-control for HD_MASTER_SEED)  
**Reviewed:** 2026-04-21  
**Rotation cadence:** See per-secret table below

---

## Rotation Cadence Summary

| Secret | Secrets Manager Key | Cadence | Dual-control required |
|--------|-------------------|---------|----------------------|
| DB password | `/{env}/db/password` | 180 days | No |
| JWT secret | `/{env}/auth/jwt-secret` | 90 days | No |
| HD master seed | `/{env}/wallet/hd-master-seed` | Never (migration required) | Yes — 2 admins |
| WebAuthn RPID | `/{env}/auth/webauthn-rpid` | Never (tied to credential DB) | Yes — 2 admins |
| Slack webhook URL | `/{env}/ops/slack-webhook-url` | 365 days | No |
| OTLP API token | `/{env}/otel/otlp-api-token` | 365 days | No |
| OIDC client secret | `/{env}/auth/oidc-client-secret` | 365 days | No |

---

## General Rotation Procedure

For all secrets (unless a per-secret section overrides):

1. Generate new secret value (use a password manager or `openssl rand -base64 32`)
2. Store new value in Secrets Manager alongside old value (dual-value staging)
3. Deploy new ECS task revision with updated secret ARN / version
4. Verify application healthcheck passes with new secret
5. Remove old secret version from Secrets Manager
6. Update rotation date in this document

---

## DB Password (`/{env}/db/password`)

**Cadence:** 180 days  
**Downtime:** ~30 seconds (ECS rolling restart)

```bash
# 1. Generate new password
NEW_PASS=$(openssl rand -base64 24 | tr -d '/+=')

# 2. Update RDS master password
aws rds modify-db-instance \
  --db-instance-identifier wp-{env}-postgres \
  --master-user-password "$NEW_PASS" \
  --apply-immediately

# 3. Update Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id "/{env}/db/password" \
  --secret-string "$NEW_PASS"

# 4. Force ECS service redeployment to pick up new DATABASE_URL
aws ecs update-service \
  --cluster wp-{env} \
  --service admin-api \
  --force-new-deployment

# 5. Verify health
curl -f https://api.{domain}/health
```

---

## JWT Secret (`/{env}/auth/jwt-secret`)

**Cadence:** 90 days  
**Downtime:** ~0 (all in-flight tokens expire within 15 minutes; brief re-login for active sessions)

```bash
# 1. Generate new secret (32 bytes minimum)
NEW_SECRET=$(openssl rand -hex 32)

# 2. Update Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id "/{env}/auth/jwt-secret" \
  --secret-string "$NEW_SECRET"

# 3. Rolling ECS restart (admin-api picks up new secret)
aws ecs update-service \
  --cluster wp-{env} \
  --service admin-api \
  --force-new-deployment

# 4. All active sessions will require re-login within 15 min (JWT expiry)
# No further action needed.
```

---

## HD Master Seed (`/{env}/wallet/hd-master-seed`)

**WARNING: NEVER rotate without a full wallet migration plan.**  
Rotating the HD seed means all deposit addresses change. This requires:
- Generating a new seed + new address set
- Migrating all user deposit addresses in the database
- Sweeping any remaining balances from old addresses
- Customer communication (addresses change)

**This rotation requires dual control — 2 admins present.**

```
Pre-rotation checklist:
  [ ] All in-flight deposits credited (no pending confirmations)
  [ ] All sweep queues empty
  [ ] Maintenance window announced (all deposit operations paused)
  [ ] Migration script reviewed and tested in staging
  [ ] New seed generated in air-gapped environment
  [ ] New seed backed up (HSM or encrypted offline copy — 2 copies, separate locations)

Rotation steps (high-level):
  1. Pause all deposits via kill-switch
  2. Generate new HD seed (air-gapped)
  3. Store new seed in Secrets Manager (dual-admin access)
  4. Run migration script: generate new addresses, update DB
  5. Deploy new wallet-engine version referencing new seed ARN
  6. Verify address derivation matches expected output
  7. Resume deposits (new addresses active)
  8. Sweep any residual funds from old addresses (monitor for 30d)
  9. Decommission old seed from Secrets Manager after 30d monitoring period
```

Post-migration: verify CloudTrail shows no access to old seed ARN after decommission.

---

## WebAuthn RPID (`/{env}/auth/webauthn-rpid`)

**CRITICAL: Changing the RPID invalidates ALL registered WebAuthn credentials.**  
Staff would need to re-register all security keys.

Only rotate if:
- Domain name changes permanently
- Credential database is compromised

This rotation requires dual control and a maintenance window where all staff must re-register keys.

---

## Slack Webhook URL (`/{env}/ops/slack-webhook-url`)

**Cadence:** 365 days or on suspected leak  

1. In Slack: go to App configuration → Incoming Webhooks → Regenerate URL
2. Update Secrets Manager:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id "/{env}/ops/slack-webhook-url" \
     --secret-string "https://hooks.slack.com/services/NEW/URL"
   ```
3. Restart Alertmanager container (or ECS service) to pick up new URL
4. Send test alert: `curl -X POST alertmanager:9093/api/v2/alerts -d '[...]'`

---

## OTLP API Token (`/{env}/otel/otlp-api-token`)

**Cadence:** 365 days  

1. In Grafana Cloud: Settings → API Keys → Rotate
2. Update Secrets Manager:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id "/{env}/otel/otlp-api-token" \
     --secret-string "Bearer <new-token>"
   ```
3. Restart OTel collector ECS service
4. Verify spans appear in Grafana Explore within 2 minutes

---

## OIDC Client Secret (`/{env}/auth/oidc-client-secret`)

**Cadence:** 365 days  

1. In Google Cloud Console: APIs & Services → Credentials → OAuth 2.0 → Regenerate secret
2. Update Secrets Manager:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id "/{env}/auth/oidc-client-secret" \
     --secret-string "<new-secret>"
   ```
3. Redeploy admin-api
4. Verify login flow works end-to-end

---

## Post-Rotation Checklist

After any rotation:

- [ ] Application healthcheck passes
- [ ] No error spikes in Grafana / CloudWatch
- [ ] Old secret version removed from Secrets Manager
- [ ] Rotation date updated in this document
- [ ] Audit log entry confirms rotation (action: `secret.rotated`, actor: staff email)
- [ ] CloudTrail shows new secret ARN version accessed (not old)
