// Tests for telemetry/sentry.ts — 0% coverage.
// initSentry: noop when SENTRY_DSN missing, initialises once, idempotent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSentryInit = vi.fn();

vi.mock('@sentry/node', () => ({
  init: mockSentryInit,
}));

describe('sentry — initSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules(); // reset `initialised` module-level state
    delete process.env.SENTRY_DSN;
  });
  afterEach(() => {
    delete process.env.SENTRY_DSN;
    vi.resetModules();
  });

  it('does not call Sentry.init when SENTRY_DSN is absent', async () => {
    const { initSentry } = await import('../telemetry/sentry.js');
    initSentry();
    expect(mockSentryInit).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with dsn when SENTRY_DSN is set', async () => {
    process.env.SENTRY_DSN = 'https://fakeDsn@sentry.io/123';
    const { initSentry } = await import('../telemetry/sentry.js');
    initSentry();
    expect(mockSentryInit).toHaveBeenCalledOnce();
    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://fakeDsn@sentry.io/123' })
    );
  });

  it('passes NODE_ENV as environment to Sentry', async () => {
    process.env.SENTRY_DSN = 'https://fakeDsn@sentry.io/123';
    process.env.NODE_ENV = 'production';
    const { initSentry } = await import('../telemetry/sentry.js');
    initSentry();
    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'production' })
    );
    delete process.env.NODE_ENV;
  });

  it('is idempotent — calling twice only initialises Sentry once', async () => {
    process.env.SENTRY_DSN = 'https://fakeDsn@sentry.io/123';
    const { initSentry } = await import('../telemetry/sentry.js');
    initSentry();
    initSentry();
    expect(mockSentryInit).toHaveBeenCalledOnce();
  });
});
