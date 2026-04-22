// Real-API fixture — seeds browser with dev-mode staff session and lets all
// API calls hit the real backend (no mocking). Used for functional e2e tests.
//
// Requires:
//   - VITE_AUTH_DEV_MODE=true on the Vite dev server (set in playwright.config.ts webServer.env)
//   - AUTH_DEV_MODE=true on admin-api (POST /auth/session/dev-login must respond 200)
//   - Services running: UI :5173, admin-api :3001
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { DevStaff } from './dev-auth-fixture';
import { DEV_ADMIN } from './dev-auth-fixture';

export { expect };

export type { DevStaff };

export const DEV_BEN: DevStaff = {
  id: 'stf_ben',
  name: 'Ben Foster',
  email: 'ben@treasury.io',
  role: 'treasurer',
};

export const DEV_HANA: DevStaff = {
  id: 'stf_hana',
  name: 'Hana Petersen',
  email: 'hana@treasury.io',
  role: 'treasurer',
};

export { DEV_ADMIN };

/**
 * Seeds the page with:
 *  1. Real server-side session cookie (POST /api/auth/session/dev-login via browser context)
 *  2. Dev staff override in localStorage (AuthProvider reads __dev_staff__ when VITE_AUTH_DEV_MODE=true)
 *  3. English language (wp-tweaks Zustand store) so all text-based selectors match English strings
 *
 * Must be called BEFORE page.goto() — addInitScript fires on every navigation.
 * The dev-login call also establishes the session cookie so backend API calls succeed.
 */
export async function seedRealAuth(page: Page, staff: DevStaff = DEV_ADMIN): Promise<void> {
  // 1. Create real session cookie via dev-login — this makes backend API calls succeed.
  //    Using page.context().request shares the browser's cookie store.
  try {
    await page.context().request.post('http://localhost:3001/auth/session/dev-login', {
      data: { email: staff.email },
    });
  } catch {
    // non-fatal — UI will fall back to client-side dev-mode auth for display
  }

  // 2. Seed localStorage for client-side AuthProvider + English locale
  await page.addInitScript((s) => {
    localStorage.setItem('__dev_staff__', JSON.stringify(s));
    // Force English in Zustand tweaks-store (persisted under key 'wp-tweaks').
    // Zustand persist v3 format: { state: { lang: 'en', ... }, version: 3 }
    // We merge into existing persisted state so we don't clobber theme/density/etc.
    const raw = localStorage.getItem('wp-tweaks');
    let existing: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 3,
    };
    if (raw) {
      try {
        existing = JSON.parse(raw);
      } catch {
        // ignore malformed
      }
    }
    existing.state = { ...existing.state, lang: 'en' };
    localStorage.setItem('wp-tweaks', JSON.stringify(existing));
  }, staff);
}

/**
 * Navigate to an /app/* route and wait for the page shell to be ready.
 * Equivalent to gotoApp in visual-test-base but without mock-api.
 */
export async function gotoApp(page: Page, path: string): Promise<void> {
  await page.goto(`/app/${path}`);
  await page.waitForSelector('[data-testid="app-layout"], nav, .sidebar, aside, .topbar', {
    timeout: 20_000,
  });
  // Let React finish any pending state updates
  await page.waitForTimeout(500);
}

/** Extended test fixture with real-API auth pre-seeded. */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    // Seed dev-mode auth + English locale so LoginGate passes and selectors work
    await seedRealAuth(page, DEV_ADMIN);
    await use(page);
  },
});
