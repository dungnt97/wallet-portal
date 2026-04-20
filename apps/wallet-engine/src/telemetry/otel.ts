// OpenTelemetry SDK bootstrap — MUST be imported before any other module in server.ts
// Instruments HTTP (Fastify), pg, ioredis, BullMQ automatically via auto-instrumentations.
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const { ParentBasedSampler, TraceIdRatioBasedSampler, AlwaysOnSampler } = tracing;

const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';

const otlpEndpoint =
  (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318') + '/v1/traces';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'wallet-engine';

const sampler = isDev
  ? new AlwaysOnSampler()
  : new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(0.1) });

export const sdk = new NodeSDK({
  serviceName,
  traceExporter: new OTLPTraceExporter({ url: otlpEndpoint }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
  sampler,
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().catch((err) => console.error('OTel shutdown error', err));
});

console.log(`[otel] wallet-engine telemetry started → ${otlpEndpoint}`);
