// Sentry error-tracking bootstrap — noop if SENTRY_DSN is absent.
// Call initSentry() once at process start (after otel.ts).
import * as Sentry from '@sentry/node';

let initialised = false;

export function initSentry(): void {
  if (initialised) return;
  initialised = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // No DSN configured — Sentry stays completely silent; no network calls.
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Capture 10% of transactions for performance monitoring
    tracesSampleRate: 0.1,
    // Link Sentry traces with OTel via built-in propagation
    integrations: [],
  });

  console.log('[sentry] admin-api error tracking initialised');
}
