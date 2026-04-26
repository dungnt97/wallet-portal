// Tests for lib/sentry.ts — initSentry() idempotency and DSN guard.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock @sentry/browser ──────────────────────────────────────────────────────

const mockSentryInit = vi.fn();

vi.mock('@sentry/browser', () => ({
  init: (...args: unknown[]) => mockSentryInit(...args),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules(); // reset module-level `initialised` flag between tests
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('initSentry (lib/sentry.ts)', () => {
  it('does not call Sentry.init when VITE_SENTRY_DSN is not set', async () => {
    // DSN is unset by default in test env
    const { initSentry } = await import('../sentry');
    initSentry();
    expect(mockSentryInit).not.toHaveBeenCalled();
  });

  it('calls Sentry.init when VITE_SENTRY_DSN is set', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
    const { initSentry } = await import('../sentry');
    initSentry();
    expect(mockSentryInit).toHaveBeenCalledOnce();
  });

  it('passes the DSN to Sentry.init', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
    const { initSentry } = await import('../sentry');
    initSentry();
    const call = mockSentryInit.mock.calls[0][0] as { dsn: string };
    expect(call.dsn).toBe('https://abc@sentry.io/1');
  });

  it('sets tracesSampleRate to 0.1', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
    const { initSentry } = await import('../sentry');
    initSentry();
    const call = mockSentryInit.mock.calls[0][0] as { tracesSampleRate: number };
    expect(call.tracesSampleRate).toBe(0.1);
  });

  it('is idempotent — calls Sentry.init only once even if called multiple times', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
    const { initSentry } = await import('../sentry');
    initSentry();
    initSentry();
    initSentry();
    expect(mockSentryInit).toHaveBeenCalledOnce();
  });
});
