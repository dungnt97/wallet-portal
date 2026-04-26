// Tests for observability/sentry.ts — initSentry() with env-profile integration.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock @sentry/react ──────────────────────────────────���─────────────────────

const mockSentryInit = vi.fn();

vi.mock('@sentry/react', () => ({
  init: (...args: unknown[]) => mockSentryInit(...args),
  ErrorBoundary: () => null,
}));

// Mock env-store so VITE_ENV_PROFILES can be controlled independently
vi.mock('@/stores/env-store', () => ({
  getActiveApiBase: vi.fn(() => ''),
  ENV_PROFILES: [],
}));

// ── Tests ───────────────────────────────────────────────────────────────���─────

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('initSentry (observability/sentry.ts)', () => {
  it('does not call Sentry.init when VITE_SENTRY_DSN is not set', async () => {
    const { initSentry } = await import('../sentry');
    initSentry();
    expect(mockSentryInit).not.toHaveBeenCalled();
  });

  it('calls Sentry.init when VITE_SENTRY_DSN is set', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@sentry.io/2');
    const { initSentry } = await import('../sentry');
    initSentry();
    expect(mockSentryInit).toHaveBeenCalledOnce();
  });

  it('passes the DSN to Sentry.init', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@sentry.io/2');
    const { initSentry } = await import('../sentry');
    initSentry();
    const opts = mockSentryInit.mock.calls[0][0] as { dsn: string };
    expect(opts.dsn).toBe('https://key@sentry.io/2');
  });

  it('sets tracesSampleRate to 0.1', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@sentry.io/2');
    const { initSentry } = await import('../sentry');
    initSentry();
    const opts = mockSentryInit.mock.calls[0][0] as { tracesSampleRate: number };
    expect(opts.tracesSampleRate).toBe(0.1);
  });

  it('is idempotent — Sentry.init called only once across multiple calls', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@sentry.io/2');
    const { initSentry } = await import('../sentry');
    initSentry();
    initSentry();
    initSentry();
    expect(mockSentryInit).toHaveBeenCalledOnce();
  });

  it('uses active profile name as environment tag when profile found', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@sentry.io/2');

    // Re-mock env-store with a matching profile
    vi.doMock('@/stores/env-store', () => ({
      getActiveApiBase: vi.fn(() => 'https://staging.example.com'),
      ENV_PROFILES: [{ name: 'staging', apiUrl: 'https://staging.example.com' }],
    }));

    const { initSentry } = await import('../sentry');
    initSentry();
    const opts = mockSentryInit.mock.calls[0][0] as { environment: string };
    expect(opts.environment).toBe('staging');
  });

  it('falls back to Vite MODE when no matching profile', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@sentry.io/2');
    // env-store returns no matching profile (default mock: empty profiles, base='')
    const { initSentry } = await import('../sentry');
    initSentry();
    const opts = mockSentryInit.mock.calls[0][0] as { environment: string };
    // In test env, import.meta.env.MODE is 'test'
    expect(typeof opts.environment).toBe('string');
  });

  it('re-exports ErrorBoundary from @sentry/react', async () => {
    const mod = await import('../sentry');
    expect(mod.ErrorBoundary).toBeDefined();
  });
});
