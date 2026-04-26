import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Tests for telemetry/otel.ts and telemetry/sentry.ts
// otel.ts: SDK construction, sampler selection, SIGTERM handler, console.log
// sentry.ts: initSentry noop when DSN absent, init when DSN present, idempotent guard

// ── Mock @opentelemetry packages ──────────────────────────────────────────────

// Use module-level stable functions so clearAllMocks() doesn't break SIGTERM handlers
// that were registered by previous test imports and still hold a closure reference.
const mockSdkStart = vi.fn();
// mockSdkShutdown must always return a Promise — the SIGTERM handler calls .catch()
// on whatever instance was captured when the module was imported.  Wrapping in a
// stable arrow means even after vi.clearAllMocks() the handler won't crash.
const mockSdkShutdown = vi.fn().mockResolvedValue(undefined);
const MockNodeSDK = vi.fn().mockImplementation(() => ({
  start: mockSdkStart,
  // Always return a real Promise regardless of vi.clearAllMocks()
  shutdown: () => Promise.resolve(),
}));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: MockNodeSDK,
  tracing: {
    ParentBasedSampler: vi.fn().mockImplementation((opts: unknown) => ({
      type: 'ParentBasedSampler',
      opts,
    })),
    TraceIdRatioBasedSampler: vi.fn().mockImplementation((rate: number) => ({
      type: 'TraceIdRatioBasedSampler',
      rate,
    })),
    AlwaysOnSampler: vi.fn().mockImplementation(() => ({ type: 'AlwaysOnSampler' })),
  },
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn().mockImplementation((opts: unknown) => ({ opts })),
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: vi.fn().mockReturnValue([]),
}));

// ── Mock @sentry/node ─────────────────────────────────────────────────────────

const mockSentryInit = vi.fn();
vi.mock('@sentry/node', () => ({
  init: (...args: unknown[]) => mockSentryInit(...args),
}));

// Track SIGTERM listeners added during otel imports so we can remove them after each test.
// This prevents stale listeners from firing after teardown and causing unhandled errors.
const sigtermListeners: Array<() => void> = [];
const origAddListener = process.addListener.bind(process);
const origOn = process.on.bind(process);

// ── otel.ts tests ─────────────────────────────────────────────────────────────

describe('otel.ts — SDK bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Patch process.on to capture SIGTERM listeners for cleanup
    // biome-ignore lint/suspicious/noExplicitAny: needed for listener interception
    process.on = ((event: string, listener: (...args: any[]) => void) => {
      if (event === 'SIGTERM') sigtermListeners.push(listener as () => void);
      return origOn(event, listener);
      // biome-ignore lint/suspicious/noExplicitAny: needed for listener interception
    }) as any;
  });

  afterEach(() => {
    // Remove all SIGTERM listeners registered during this test to prevent teardown errors
    for (const l of sigtermListeners) {
      process.removeListener('SIGTERM', l);
    }
    sigtermListeners.length = 0;
    // Restore original process.on
    process.on = origOn;
    process.addListener = origAddListener;
    vi.unstubAllEnvs();
  });

  it('starts NodeSDK on module load', async () => {
    MockNodeSDK.mockImplementation(() => ({ start: mockSdkStart, shutdown: mockSdkShutdown }));
    await import('../telemetry/otel.js');
    expect(mockSdkStart).toHaveBeenCalledTimes(1);
  });

  it('uses AlwaysOnSampler in development (non-production)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { tracing } = await import('@opentelemetry/sdk-node');
    await import('../telemetry/otel.js');
    expect(tracing.AlwaysOnSampler).toHaveBeenCalled();
  });

  it('uses ParentBasedSampler in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { tracing } = await import('@opentelemetry/sdk-node');
    await import('../telemetry/otel.js');
    expect(tracing.ParentBasedSampler).toHaveBeenCalled();
    expect(tracing.TraceIdRatioBasedSampler).toHaveBeenCalledWith(0.1);
  });

  it('uses custom OTEL_EXPORTER_OTLP_ENDPOINT when set', async () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://collector.internal:4318');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    await import('../telemetry/otel.js');
    expect(OTLPTraceExporter).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://collector.internal:4318/v1/traces' })
    );
  });

  it('defaults to localhost:4318 when OTEL_EXPORTER_OTLP_ENDPOINT is unset', async () => {
    // Delete so ?? fallback fires (empty string does not trigger ??)
    const saved = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    // biome-ignore lint/performance/noDelete: test env cleanup
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    await import('../telemetry/otel.js');
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = saved;
    const callArg = vi.mocked(OTLPTraceExporter).mock.calls[0]?.[0] as { url: string } | undefined;
    expect(callArg?.url).toContain('localhost:4318');
  });

  it('uses OTEL_SERVICE_NAME env when set', async () => {
    vi.stubEnv('OTEL_SERVICE_NAME', 'my-custom-service');
    await import('../telemetry/otel.js');
    expect(MockNodeSDK).toHaveBeenCalledWith(
      expect.objectContaining({ serviceName: 'my-custom-service' })
    );
  });

  it('SIGTERM handler is registered on process', async () => {
    const listenersBefore = process.listenerCount('SIGTERM');
    await import('../telemetry/otel.js');
    // A new SIGTERM listener is added by the module
    expect(process.listenerCount('SIGTERM')).toBeGreaterThan(listenersBefore);
  });
});

// ── sentry.ts tests ───────────────────────────────────────────────────────────

describe('sentry.ts — initSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does NOT call Sentry.init when SENTRY_DSN is absent', async () => {
    vi.stubEnv('SENTRY_DSN', '');
    const { initSentry } = await import('../telemetry/sentry.js');
    initSentry();
    expect(mockSentryInit).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with dsn and environment when SENTRY_DSN is set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@sentry.io/123');
    vi.stubEnv('NODE_ENV', 'production');
    const { initSentry } = await import('../telemetry/sentry.js');
    initSentry();
    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://key@sentry.io/123',
        environment: 'production',
        tracesSampleRate: 0.1,
      })
    );
  });

  it('is idempotent — Sentry.init called only once even if called twice', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@sentry.io/456');
    const { initSentry } = await import('../telemetry/sentry.js');
    initSentry();
    initSentry();
    expect(mockSentryInit).toHaveBeenCalledTimes(1);
  });

  it('defaults environment to "development" when NODE_ENV unset', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@sentry.io/789');
    // Delete NODE_ENV so process.env.NODE_ENV is undefined → ?? 'development' kicks in
    const saved = process.env.NODE_ENV;
    // biome-ignore lint/performance/noDelete: test env cleanup
    delete process.env.NODE_ENV;
    const { initSentry } = await import('../telemetry/sentry.js');
    initSentry();
    process.env.NODE_ENV = saved;
    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'development' })
    );
  });
});
