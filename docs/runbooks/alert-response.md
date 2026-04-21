# Alert Response Runbook

Per-alert triage steps, likely causes, remediation commands, and escalation paths.

---

## WithdrawalLatencyP95High

**Severity:** warning
**Condition:** POST /withdrawals p95 > 30 s for 5 min

### Triage

```promql
# Confirm current p95
histogram_quantile(0.95, sum(rate(http_server_request_duration_seconds_bucket{route="/withdrawals",method="POST"}[5m])) by (le))

# Break down by status to spot failures inflating latency
sum(rate(http_server_requests_total{route="/withdrawals"}[5m])) by (status_code)

# Check policy-engine latency (policy check is inline on POST /withdrawals)
histogram_quantile(0.95, sum(rate(http_server_request_duration_seconds_bucket{job="policy-engine"}[5m])) by (le, route))
```

### Likely causes

1. DB slow query — missing index on `withdrawals` table or lock contention
2. policy-engine timeout — check `/health/ready` on `policy-engine:3003`
3. External RPC call blocking — withdrawal-execute worker hitting slow RPC
4. Queue backlog — withdrawal-execute queue depth spiked

### Remediation

```bash
# Check admin-api logs for slow query warnings
aws logs filter-log-events --log-group-name /ecs/wp-prod/admin-api --filter-pattern "slow"

# Check policy-engine health
curl -sf http://policy-engine:3003/health/ready | jq .

# Check queue depth
redis-cli -u $REDIS_URL llen "bull:withdrawal-execute:wait"
```

### Escalation

If p95 > 60 s or >10 errors/min: escalate to on-call engineering lead.

---

## AuditWriteFailures

**Severity:** critical
**Condition:** `audit_write_errors_total` increments at all (rate > 0 for 2 min)

### Triage

```promql
# Confirm rate
rate(audit_write_errors_total[5m])

# Look at when it started
increase(audit_write_errors_total[1h])
```

### Likely causes

1. DB trigger failure — `hash_audit_log` trigger function errors (check pg logs)
2. DB connection exhausted — pool at max, inserts timing out
3. `audit_log` table schema mismatch after migration

### Remediation

```bash
# Check DB trigger status
psql $DATABASE_URL -c "SELECT proname, prosrc FROM pg_proc WHERE proname = 'hash_audit_log';"

# Check recent DB errors
aws logs filter-log-events --log-group-name /ecs/wp-prod/admin-api \
  --filter-pattern "audit" --start-time $(date -d '30 minutes ago' +%s000)

# Verify audit_log table is writable
psql $DATABASE_URL -c "INSERT INTO audit_log (staff_id, action, resource_type, resource_id, changes, hash) VALUES (NULL, 'test.probe', 'probe', 'probe', '{}', '') RETURNING id;"
```

### Escalation

Immediate — audit trail integrity issue. Alert security + engineering on-call.

---

## DbConnectionExhausted

**Severity:** warning
**Condition:** `pg_pool_in_use / pg_pool_max > 0.9` for 5 min

### Triage

```promql
# Current utilisation
pg_pool_in_use_connections / pg_pool_max_connections

# Which service is consuming most
pg_pool_in_use_connections
```

### Likely causes

1. Long-running transactions holding connections (bulk operations, migrations)
2. Query performance regression causing connections to be held longer
3. Connection pool size too small for current load
4. Leaked connections (missing pool.release() in error paths)

### Remediation

```bash
# Check active queries in Postgres
psql $DATABASE_URL -c "SELECT pid, state, query_start, left(query,80) FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;"

# Kill long-running idle-in-transaction
psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND query_start < NOW() - INTERVAL '5 minutes';"
```

### Escalation

If utilisation reaches 100% (new connections failing): restart least-critical service first (wallet-engine), then investigate.

---

## KillSwitchActivated

**Severity:** critical
**Condition:** `wallet_portal_kill_switch_enabled == 1` (immediate)

### Triage

This alert fires the moment the kill-switch is enabled. It may be intentional (ops action during incident) or accidental.

```promql
# Confirm current state
wallet_portal_kill_switch_enabled

# Check when it changed (if recording rule exists)
changes(wallet_portal_kill_switch_enabled[1h])
```

### Likely causes

1. **Intentional** — ops staff toggled via admin dashboard during active incident
2. **Accidental** — misconfigured automation or script triggered the toggle
3. **Security response** — triggered by security team during suspected attack

### Remediation

```bash
# Verify current state via API
curl -H "Authorization: Bearer $SVC_BEARER_TOKEN" http://policy-engine:3003/v1/check \
  -d '{"operation_type":"withdrawal","chain":"bnb","amount":"1"}' | jq .reasons

# Check admin-api audit log for who toggled it
psql $DATABASE_URL -c "SELECT created_at, staff_id, changes FROM audit_log WHERE action = 'kill_switch.toggle' ORDER BY created_at DESC LIMIT 5;"
```

**To disable:** Use the admin dashboard Ops → Kill Switch panel, or directly:

```bash
psql $DATABASE_URL -c "UPDATE kill_switch SET enabled = false WHERE id = 1;"
```

### Escalation

Always notify security + engineering lead when investigating. Do not disable without confirming the original reason for activation.

---

## RpcProbeFailRateHigh

**Severity:** warning
**Condition:** `rpc_probe_failures / rpc_probe_total > 10%` for 10 min

### Triage

```promql
# Failure rate by chain
rate(rpc_probe_failures_total[5m]) / rate(rpc_probe_total[5m])

# Absolute counts
rate(rpc_probe_total[5m])
rate(rpc_probe_failures_total[5m])
```

### Likely causes

1. RPC provider outage or rate-limiting
2. Network partition between ECS tasks and RPC endpoints
3. RPC endpoint URL changed or authentication rotated

### Remediation

```bash
# Test BNB RPC manually
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  $BNB_RPC_URL

# Check wallet-engine logs for RPC errors
aws logs filter-log-events --log-group-name /ecs/wp-prod/wallet-engine \
  --filter-pattern "RPC"
```

**Failover:** Configure backup RPC URLs in `BNB_RPC_URLS` / `SOLANA_RPC_URLS` env vars and restart wallet-engine task.

### Escalation

If failure rate > 50% for >30 min: escalate to on-call. Block watchers are likely producing stale deposit detection.

---

## WorkerHeartbeatStale

**Severity:** critical
**Condition:** `time() - worker_last_heartbeat_seconds > 120 s` for 2 min

### Triage

```promql
# Age of each worker heartbeat
time() - worker_last_heartbeat_seconds

# Which workers are affected
worker_last_heartbeat_seconds
```

### Likely causes

1. Worker process crashed (OOM, unhandled exception, segfault)
2. Redis connection lost (heartbeat writes to Redis)
3. Worker deadlocked on a job (BullMQ stalled job)
4. ECS task stopped by health-check failure

### Remediation

```bash
# Check ECS task status
aws ecs describe-tasks --cluster wp-prod --tasks $(aws ecs list-tasks --cluster wp-prod --service-name wp-prod-wallet-engine --query 'taskArns[0]' --output text)

# Check BullMQ stalled jobs in Redis
redis-cli -u $REDIS_URL keys "bull:*:stalled"

# Force restart ECS service (rolling replacement)
aws ecs update-service --cluster wp-prod --service wp-prod-wallet-engine --force-new-deployment
```

### Escalation

If worker down >5 min: escalate. Deposits/withdrawals/sweeps may be queued but unprocessed.

---

## ReconciliationDriftCritical

**Severity:** critical
**Condition:** `reconciliation_drift_critical_count > 0` (immediate)

### Triage

```promql
reconciliation_drift_critical_count
```

```bash
# Find affected wallets in last snapshot
psql $DATABASE_URL -c "
  SELECT wallet_address, chain, on_chain_balance, ledger_balance,
         abs(on_chain_balance::numeric - ledger_balance::numeric) as drift,
         snapshot_at
  FROM reconciliation_snapshots
  WHERE drift_status = 'critical'
  ORDER BY snapshot_at DESC LIMIT 20;"
```

### Likely causes

1. Missed deposit credit (block watcher gap or reorg not handled)
2. Double-credit bug in deposit-confirm worker
3. Ledger balance update failure during withdrawal execution
4. Manual DB edit without corresponding on-chain action

### Remediation

1. Identify affected wallet addresses from DB query above
2. Cross-reference on-chain balance via RPC vs ledger
3. If deficit: halt new withdrawals for affected wallets (kill-switch if widespread)
4. Investigate block watcher gap: compare `block_checkpoint` table vs chain head

### Escalation

Immediate — potential financial loss or data integrity issue. Escalate to engineering + finance + security.

---

## CeremonyPartial

**Severity:** warning
**Condition:** `signer_ceremony_partial_count > 0` for 60 min

### Triage

```promql
signer_ceremony_partial_count
```

```bash
# Find stuck ceremonies
psql $DATABASE_URL -c "
  SELECT id, ceremony_type, chain, status, created_at, updated_at,
         confirmed_signers, required_signers
  FROM signer_ceremonies
  WHERE status = 'partial'
  ORDER BY created_at;"
```

### Likely causes

1. Signer unavailable (offline device, sick/leave)
2. Signer app crashed mid-ceremony (signature not submitted)
3. Ceremony timeout not configured (ceremony waits indefinitely)

### Remediation

1. Contact missing signers via out-of-band channel (phone/Signal)
2. If signer is permanently unavailable: cancel ceremony and re-initiate with quorum
3. Cancel via admin dashboard: Signers → Ceremonies → [ceremony ID] → Cancel

```bash
# Cancel via API (ops role required)
curl -X POST -H "Authorization: Bearer $STAFF_JWT" \
  "http://admin-api:3001/admin/ceremonies/$CEREMONY_ID/cancel"
```

### Escalation

If ceremony is for ownership change (recovery): notify security lead immediately regardless of duration.
