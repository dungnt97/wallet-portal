import { trace } from '@opentelemetry/api';
import type { FastifyPluginAsync } from 'fastify';
// Fastify telemetry plugin — exposes /metrics (Prometheus) and wires request hooks
// for HTTP counters + duration histograms. OTel SDK is initialised in server.ts before
// this plugin loads; this plugin only adds the Fastify-level instrumentation.
import fp from 'fastify-plugin';
import { httpRequestDurationSeconds, httpRequestsTotal, registry } from '../telemetry/metrics.js';

const telemetryPlugin: FastifyPluginAsync = async (app) => {
  // ── Prometheus /metrics endpoint ─────────────────────────────────────────
  app.get('/metrics', { schema: { hide: true } }, async (_req, reply) => {
    const metrics = await registry.metrics();
    void reply.code(200).header('Content-Type', registry.contentType).send(metrics);
  });

  // ── Per-request hooks — record duration + count ──────────────────────────
  app.addHook('onRequest', async (request, reply) => {
    // Attach high-res start time for duration calculation
    (request as typeof request & { _startTime: number })._startTime = Date.now();

    // Echo or generate x-request-id
    const reqId = (request.headers['x-request-id'] as string | undefined) ?? request.id;
    void reply.header('x-request-id', reqId);
  });

  app.addHook('onResponse', async (request, reply) => {
    const start = (request as typeof request & { _startTime: number })._startTime ?? Date.now();
    const durationSec = (Date.now() - start) / 1000;
    const route = request.routeOptions?.url ?? request.url;
    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSec);
  });

  app.log.info('[telemetry] Prometheus metrics + OTel hooks active');
};

// Re-export trace helper so route handlers can add custom spans without importing OTel directly
export { trace };

export default fp(telemetryPlugin, { name: 'telemetry' });
