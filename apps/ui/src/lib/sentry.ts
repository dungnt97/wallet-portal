// Client-side Sentry bootstrap — noop if VITE_SENTRY_DSN is absent.
// Import and call initSentry() once in main.tsx before rendering.
import * as Sentry from '@sentry/browser';

let initialised = false;

export function initSentry(): void {
  if (initialised) return;
  initialised = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // No DSN — completely silent, no network calls
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Capture 10% of page-load/navigation transactions
    tracesSampleRate: 0.1,
    integrations: [],
  });
}
