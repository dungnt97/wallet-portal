// OpenTelemetry stub plugin — wire-only, no-op exporter (real collector wired in P10)
// Decorates the app with a trace-ID injector for request correlation
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';

const telemetryPlugin: FastifyPluginAsync = async (app) => {
  // Propagate or generate x-request-id on every request
  app.addHook('onRequest', async (request, reply) => {
    const traceId =
      (request.headers['x-request-id'] as string | undefined) ?? randomUUID();
    request.headers['x-request-id'] = traceId;
    void reply.header('x-request-id', traceId);
  });

  app.log.info('OpenTelemetry stub loaded — no-op exporter (real collector in P10)');
};

export default fp(telemetryPlugin, { name: 'telemetry' });
