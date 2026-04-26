// Tests for telemetry/otel.ts — 0% coverage.
// Verifies NodeSDK is constructed and started. Mocks all OTel packages to avoid
// real OTLP connections. The SIGTERM handler is registered as a side-effect.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock all OTel packages before any import ──────────────────────────────────

const mockSdkStart = vi.fn();
const mockSdkShutdown = vi.fn().mockResolvedValue(undefined);
const MockNodeSDK = vi.fn().mockImplementation(() => ({
  start: mockSdkStart,
  shutdown: mockSdkShutdown,
}));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: MockNodeSDK,
  tracing: {
    ParentBasedSampler: vi.fn().mockImplementation(() => ({})),
    TraceIdRatioBasedSampler: vi.fn().mockImplementation(() => ({})),
    AlwaysOnSampler: vi.fn().mockImplementation(() => ({})),
  },
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: vi.fn().mockReturnValue([]),
}));

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('otel — NodeSDK bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (not set to undefined — that coerces to string "undefined")
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (not set to undefined — that coerces to string "undefined")
    delete process.env.OTEL_SERVICE_NAME;
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (not set to undefined — that coerces to string "undefined")
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (not set to undefined — that coerces to string "undefined")
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (not set to undefined — that coerces to string "undefined")
    delete process.env.OTEL_SERVICE_NAME;
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (not set to undefined — that coerces to string "undefined")
    delete process.env.NODE_ENV;
    vi.resetModules();
  });

  it('constructs NodeSDK and calls sdk.start()', async () => {
    await import('../telemetry/otel.js');
    expect(MockNodeSDK).toHaveBeenCalledOnce();
    expect(mockSdkStart).toHaveBeenCalledOnce();
  });

  it('uses OTEL_SERVICE_NAME env var when set', async () => {
    process.env.OTEL_SERVICE_NAME = 'my-custom-service';
    await import('../telemetry/otel.js');
    const ctorCall = MockNodeSDK.mock.calls[0]?.[0] as { serviceName: string };
    expect(ctorCall.serviceName).toBe('my-custom-service');
  });

  it('defaults serviceName to wallet-engine', async () => {
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (not set to undefined — that coerces to string "undefined")
    delete process.env.OTEL_SERVICE_NAME;
    await import('../telemetry/otel.js');
    const ctorCall = MockNodeSDK.mock.calls[0]?.[0] as { serviceName: string };
    expect(ctorCall.serviceName).toBe('wallet-engine');
  });

  it('uses OTEL_EXPORTER_OTLP_ENDPOINT env var when set', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    await import('../telemetry/otel.js');
    expect(vi.mocked(OTLPTraceExporter)).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://collector:4318/v1/traces' })
    );
  });

  it('exports sdk instance', async () => {
    const mod = await import('../telemetry/otel.js');
    expect(mod.sdk).toBeDefined();
  });

  it('uses AlwaysOnSampler in development mode', async () => {
    process.env.NODE_ENV = 'development';
    const { tracing } = await import('@opentelemetry/sdk-node');
    await import('../telemetry/otel.js');
    expect(vi.mocked(tracing.AlwaysOnSampler)).toHaveBeenCalled();
  });

  it('uses ParentBasedSampler with rate 0.1 in production mode', async () => {
    process.env.NODE_ENV = 'production';
    const { tracing } = await import('@opentelemetry/sdk-node');
    await import('../telemetry/otel.js');
    expect(vi.mocked(tracing.TraceIdRatioBasedSampler)).toHaveBeenCalledWith(0.1);
    expect(vi.mocked(tracing.ParentBasedSampler)).toHaveBeenCalled();
  });
});
