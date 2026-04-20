// Sentry error-tracking bootstrap — noop if SENTRY_DSN is absent.
// Call initSentry() once at process start (after otel.ts).
import * as Sentry from '@sentry/node';

let initialised = false;

export function initSentry(): void {
  if (initialised) return;
  initialised = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    integrations: [],
  });

  console.log('[sentry] wallet-engine error tracking initialised');
}
