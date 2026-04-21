import { getActiveApiBase } from '@/stores/env-store';
import { ENV_PROFILES } from '@/stores/env-store';
// Sentry browser SDK bootstrap — noop when VITE_SENTRY_DSN is absent.
// Call initSentry() once at app boot (before React mounts).
// environment tag reflects the active env profile name (or 'development').
import * as Sentry from '@sentry/react';

let initialised = false;

export function initSentry(): void {
  if (initialised) return;
  initialised = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // No DSN — Sentry stays silent; no network calls, no overhead.
    return;
  }

  // Determine environment label from active profile name or Vite mode.
  const activeBase = getActiveApiBase();
  const activeProfile = ENV_PROFILES.find((p) => p.apiUrl === activeBase);
  const environment = activeProfile?.name ?? (import.meta.env.MODE as string) ?? 'development';

  Sentry.init({
    dsn,
    environment,
    // Sample 10% of transactions for performance monitoring.
    tracesSampleRate: 0.1,
    // Attach release tag if injected at build time.
    release: (import.meta.env.VITE_RELEASE as string | undefined) ?? undefined,
  });

  console.log(`[sentry] UI error tracking initialised (env: ${environment})`);
}

/** Re-export ErrorBoundary for wrapping the React tree in main.tsx. */
export { ErrorBoundary } from '@sentry/react';
