# Metrics Registry

Every Prometheus metric emitted by the wallet-portal stack.
Import path, type, labels, description, and linked alert rule (if any).

---

## admin-api (`service=admin-api`)

| Metric | Type | Labels | Description | Alert |
|---|---|---|---|---|
| `http_server_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests handled | — |
| `http_server_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | HTTP request duration. Buckets: 5ms–5s | `WithdrawalLatencyP95High` |
| `audit_write_errors_total` | Counter | — | Failed `audit_log` INSERT operations (DB trigger or connection error) | `AuditWriteFailures` |
| `pg_pool_in_use_connections` | Gauge | — | Number of active (checked-out) connections in the Drizzle/pg pool | `DbConnectionExhausted` |
| `pg_pool_max_connections` | Gauge | — | Maximum pool size configured for the pg pool | `DbConnectionExhausted` |
| `worker_last_heartbeat_seconds` | Gauge | `worker` | Unix timestamp of the most recent heartbeat for each named worker | `WorkerHeartbeatStale` |
| `reconciliation_drift_critical_count` | Gauge | — | Number of wallets with critical on-chain vs ledger balance drift after last snapshot | `ReconciliationDriftCritical` |
| `signer_ceremony_partial_count` | Gauge | — | Number of signer ceremonies stuck in partial-completion state | `CeremonyPartial` |
| `withdrawal_operations_total` | Counter | `status` | Withdrawal operations counted by final status (pending/approved/completed/failed) | — |
| `process_cpu_seconds_total` | Counter | — | Node.js default: total CPU time | — |
| `nodejs_heap_size_total_bytes` | Gauge | — | Node.js default: V8 heap total | — |
| `nodejs_heap_size_used_bytes` | Gauge | — | Node.js default: V8 heap used | — |

---

## wallet-engine (`service=wallet-engine`)

| Metric | Type | Labels | Description | Alert |
|---|---|---|---|---|
| `http_server_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests handled | — |
| `http_server_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | HTTP request duration. Buckets: 5ms–5s | — |
| `deposits_detected_total` | Counter | `chain`, `token` | On-chain deposits detected by block watchers | — |
| `deposit_confirm_jobs_total` | Counter | `status` | BullMQ deposit-confirm jobs enqueued by status | — |
| `rpc_probe_total` | Counter | `chain` | Total RPC connectivity probes issued per chain | `RpcProbeFailRateHigh` |
| `rpc_probe_failures_total` | Counter | `chain` | Failed RPC connectivity probes per chain | `RpcProbeFailRateHigh` |
| `watcher_block_lag` | Gauge | `chain` | Difference between latest chain head and last locally processed block | — |
| `deposit_confirmation_duration_seconds` | Histogram | `chain` | Seconds from deposit detection to on-chain confirmation credit. Buckets: 10s–30min | — |
| `process_cpu_seconds_total` | Counter | — | Node.js default: total CPU time | — |
| `nodejs_heap_size_total_bytes` | Gauge | — | Node.js default: V8 heap total | — |

---

## policy-engine (`service=policy-engine`, `job=policy-engine`)

| Metric | Type | Labels | Description | Alert |
|---|---|---|---|---|
| `http_server_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests handled | — |
| `http_server_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | HTTP request duration. Buckets: 5ms–5s | — |
| `policy_decisions_total` | Counter | `rule`, `result` | Policy evaluation decisions per rule and result (allow\|deny) | — |
| `wallet_portal_kill_switch_enabled` | Gauge | — | 1 when global kill-switch is active, 0 otherwise. Updated on each `/v1/check` call | `KillSwitchActivated` |
| `go_goroutines` | Gauge | — | Go default: number of live goroutines | — |
| `go_gc_duration_seconds` | Summary | — | Go default: GC pause duration | — |
| `process_cpu_seconds_total` | Counter | — | Go default: total CPU time | — |

---

## OTel Collector self-metrics (`job=otel-collector`)

Scraped from `otel-collector-base:8888` (internal telemetry reader).

| Metric | Type | Labels | Description | Alert |
|---|---|---|---|---|
| `otelcol_receiver_accepted_spans` | Counter | `receiver`, `transport` | Spans accepted by the receiver | — |
| `otelcol_receiver_refused_spans` | Counter | `receiver`, `transport` | Spans refused (backpressure) | — |
| `otelcol_exporter_sent_spans` | Counter | `exporter` | Spans successfully exported | — |
| `otelcol_exporter_send_failed_spans` | Counter | `exporter` | Spans that failed to export | — |
| `otelcol_processor_batch_batch_size_trigger_send` | Counter | `processor` | Batches sent due to size trigger | — |
| `otelcol_processor_batch_timeout_trigger_send` | Counter | `processor` | Batches sent due to timeout trigger | — |
| `otelcol_process_memory_rss` | Gauge | — | Collector process RSS memory | — |

---

## Alert rule → metric cross-reference

| Alert | Metric(s) | Threshold | Severity |
|---|---|---|---|
| `WithdrawalLatencyP95High` | `http_server_request_duration_seconds_bucket` | p95 > 30 s for 5 min | warning |
| `AuditWriteFailures` | `audit_write_errors_total` | increase > 0 for 2 min | critical |
| `DbConnectionExhausted` | `pg_pool_in_use_connections`, `pg_pool_max_connections` | ratio > 0.9 for 5 min | warning |
| `KillSwitchActivated` | `wallet_portal_kill_switch_enabled` | == 1 immediately | critical |
| `RpcProbeFailRateHigh` | `rpc_probe_failures_total`, `rpc_probe_total` | failure rate > 10% for 10 min | warning |
| `WorkerHeartbeatStale` | `worker_last_heartbeat_seconds` | age > 120 s for 2 min | critical |
| `ReconciliationDriftCritical` | `reconciliation_drift_critical_count` | > 0 immediately | critical |
| `CeremonyPartial` | `signer_ceremony_partial_count` | > 0 for 60 min | warning |

---

## Metric emission gaps (TODO post-MVP)

The following metrics are declared in the registry but emission is not yet
wired at the call-site. Tracked as implementation debt:

- `pg_pool_in_use_connections` / `pg_pool_max_connections` — requires a
  periodic poller reading `drizzle`/`pg` pool stats and calling `.set()`.
  Placeholder: add to Fastify `onReady` hook with `setInterval(5000)`.
- `worker_last_heartbeat_seconds` — heartbeat writes to Redis already exist
  (Slice 9). Requires a companion Prometheus gauge updated by reading the
  Redis key periodically (every 10 s) in admin-api metrics poller.
- `reconciliation_drift_critical_count` — updated after each reconciliation
  snapshot run in `reconciliation-snapshot.worker.ts`.
- `signer_ceremony_partial_count` — requires a DB query on each metrics
  scrape or a scheduled job updating the gauge every minute.
- `rpc_probe_total` / `rpc_probe_failures_total` — requires explicit probe
  calls added to the BNB/Solana watcher poll loops in wallet-engine.
