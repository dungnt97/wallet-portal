// Prometheus metrics registration for wallet-engine.
// Exposes default Node.js process metrics + deposit-specific counters.
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({
  register: registry,
  labels: { service: process.env.OTEL_SERVICE_NAME ?? 'wallet-engine' },
});

export const httpRequestsTotal = new Counter({
  name: 'http_server_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_server_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// Wallet-engine specific metrics
export const depositsDetectedTotal = new Counter({
  name: 'deposits_detected_total',
  help: 'Total number of on-chain deposits detected',
  labelNames: ['chain', 'token'],
  registers: [registry],
});

export const depositConfirmJobsTotal = new Counter({
  name: 'deposit_confirm_jobs_total',
  help: 'Total BullMQ deposit-confirm jobs enqueued',
  labelNames: ['status'],
  registers: [registry],
});

// ── Phase 06 alert-required metrics ─────────────────────────────────────────

// RPC probe counters — used by the BNB/Solana watcher health probes.
// Alert: RpcProbeFailRate fires when failure rate > 10% over 5m.
export const rpcProbeTotal = new Counter({
  name: 'rpc_probe_total',
  help: 'Total RPC connectivity probes issued.',
  labelNames: ['chain'],
  registers: [registry],
});

export const rpcProbeFailuresTotal = new Counter({
  name: 'rpc_probe_failures_total',
  help: 'Total failed RPC connectivity probes.',
  labelNames: ['chain'],
  registers: [registry],
});

// Block lag: difference between node head and last processed block.
// Populated by the watcher on each poll cycle.
export const watcherBlockLag = new Gauge({
  name: 'watcher_block_lag',
  help: 'Difference between latest chain head and last locally processed block.',
  labelNames: ['chain'],
  registers: [registry],
});

// Deposit confirmation latency histogram — seconds between detection and credit.
export const depositConfirmationDurationSeconds = new Histogram({
  name: 'deposit_confirmation_duration_seconds',
  help: 'Time in seconds from deposit detection to on-chain confirmation credit.',
  labelNames: ['chain'],
  buckets: [10, 30, 60, 120, 300, 600, 1800],
  registers: [registry],
});
