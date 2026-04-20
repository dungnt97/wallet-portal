// Prometheus metrics registration for wallet-engine.
// Exposes default Node.js process metrics + deposit-specific counters.
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

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
