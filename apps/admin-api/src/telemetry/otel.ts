// OpenTelemetry SDK bootstrap — MUST be imported before any other module in server.ts
// Instruments HTTP (Fastify), pg, ioredis, BullMQ automatically via auto-instrumentations.
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const { ParentBasedSampler, TraceIdRatioBasedSampler, AlwaysOnSampler } = tracing;

const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';

// OTLP endpoint — default to local otel-collector; override via env in compose
const otlpEndpoint =
  (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318') + '/v1/traces';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'admin-api';

// Sampling: always-on in dev, 10% parentbased in prod
const sampler = isDev
  ? new AlwaysOnSampler()
  : new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(0.1) });

export const sdk = new NodeSDK({
  serviceName,
  traceExporter: new OTLPTraceExporter({ url: otlpEndpoint }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Reduce noise from fs instrumentation in dev
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
  sampler,
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().catch((err) => console.error('OTel shutdown error', err));
});

console.log(`[otel] admin-api telemetry started → ${otlpEndpoint}`);
