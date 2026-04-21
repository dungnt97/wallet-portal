// Prometheus metrics registration for admin-api.
// Exposes default Node.js process metrics + app-level HTTP counters.
// Mount GET /metrics in router to scrape this.
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

// Default metrics: process_cpu_seconds_total, nodejs_heap_size_total_bytes, etc.
collectDefaultMetrics({
  register: registry,
  labels: { service: process.env.OTEL_SERVICE_NAME ?? 'admin-api' },
});

// HTTP request counter — incremented by Fastify onResponse hook
export const httpRequestsTotal = new Counter({
  name: 'http_server_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

// HTTP request duration histogram — observe in Fastify onResponse hook
export const httpRequestDurationSeconds = new Histogram({
  name: 'http_server_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// ── Phase 06 alert-required metrics ─────────────────────────────────────────

// Incremented whenever an audit_log INSERT fails (trigger or DB error).
// Alert: AuditWriteFail fires when rate > 0.
export const auditWriteErrorsTotal = new Counter({
  name: 'audit_write_errors_total',
  help: 'Total failed audit_log writes (DB trigger or insert error).',
  registers: [registry],
});

// Gauge tracking live PG pool usage — updated by the pg pool stats poller.
// Alert: DbConnectionExhausted fires when in_use / max > 0.9.
export const pgPoolInUseConnections = new Gauge({
  name: 'pg_pool_in_use_connections',
  help: 'Number of active (checked-out) connections in the Drizzle/pg pool.',
  registers: [registry],
});

export const pgPoolMaxConnections = new Gauge({
  name: 'pg_pool_max_connections',
  help: 'Maximum connection pool size configured for the pg pool.',
  registers: [registry],
});

// Worker heartbeat age — seconds since last heartbeat written to Redis.
// Alert: WorkerHeartbeatStale fires when > 120s.
export const workerLastHeartbeatSeconds = new Gauge({
  name: 'worker_last_heartbeat_seconds',
  help: 'Unix timestamp of the most recent worker heartbeat written to Redis.',
  labelNames: ['worker'],
  registers: [registry],
});

// Reconciliation drift: number of wallets with critical balance mismatch.
// Alert: ReconciliationDriftCritical fires immediately when > 0.
export const reconciliationDriftCriticalCount = new Gauge({
  name: 'reconciliation_drift_critical_count',
  help: 'Number of wallets with critical on-chain vs ledger balance drift after last snapshot.',
  registers: [registry],
});

// Signer ceremony: number of in-progress ceremonies that completed partially
// (some but not all signers confirmed). Alert: CeremonyPartial fires at 60min.
export const signerCeremonyPartialCount = new Gauge({
  name: 'signer_ceremony_partial_count',
  help: 'Number of signer ceremonies in a partial-completion state (not all signers confirmed).',
  registers: [registry],
});

// Withdrawal operations counters — broken down by status.
export const withdrawalOperationsTotal = new Counter({
  name: 'withdrawal_operations_total',
  help: 'Total withdrawal operations by status.',
  labelNames: ['status'],
  registers: [registry],
});

// SMS notifications dropped without delivery — incremented when a job is
// discarded rather than sent. Reason label distinguishes known drop causes
// (e.g. creds_missing, no_phone) from unexpected ones.
export const notifSmsDroppedTotal = new Counter({
  name: 'notif_sms_dropped_total',
  help: 'Total SMS notification jobs dropped without delivery.',
  labelNames: ['reason'],
  registers: [registry],
});
