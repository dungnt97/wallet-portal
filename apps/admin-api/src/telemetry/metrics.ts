// Prometheus metrics registration for admin-api.
// Exposes default Node.js process metrics + app-level HTTP counters.
// Mount GET /metrics in router to scrape this.
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

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
