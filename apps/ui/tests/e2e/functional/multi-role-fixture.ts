// Multi-role Playwright fixture — exports per-role login helpers.
// Each helper seeds __dev_staff__ localStorage + real session cookie (via dev-login),
// mirroring the pattern in real-api-fixture.ts#seedRealAuth.
//
// Usage: import { loginAsAdmin, loginAsTreasurer, loginAsOps, loginAsViewer }
//        then call before page.goto() so addInitScript fires on first navigation.
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { DevStaff } from '../support/dev-auth-fixture';

export { expect };

// ── Seed staff definitions ────────────────────────────────────────────────────

export const STAFF_ADMIN: DevStaff = {
  id: 'stf_mira',
  name: 'Mira Sato',
  email: 'mira@treasury.io',
  role: 'admin',
};

export const STAFF_TREASURER: DevStaff = {
  id: 'stf_ben',
  name: 'Ben Foster',
  email: 'ben@treasury.io',
  role: 'treasurer',
};

export const STAFF_OPS: DevStaff = {
  id: 'stf_iris',
  name: 'Iris Bergström',
  email: 'iris@treasury.io',
  role: 'operator',
};

export const STAFF_VIEWER: DevStaff = {
  id: 'stf_kenji',
  name: 'Kenji Mori',
  email: 'kenji@treasury.io',
  role: 'viewer',
};

// ── Core seed helper ──────────────────────────────────────────────────────────

/**
 * Seeds a browser page with dev-mode auth for the given staff.
 * 1. POST /auth/session/dev-login on the backend (real session cookie).
 * 2. addInitScript — seeds __dev_staff__ + English locale in localStorage.
 *
 * Must be called BEFORE page.goto().
 */
async function seedAuth(page: Page, staff: DevStaff): Promise<void> {
  // Real session cookie so backend API calls succeed
  try {
    await page.context().request.post('http://localhost:3001/auth/session/dev-login', {
      data: { email: staff.email },
    });
  } catch {
    // non-fatal — UI falls back to localStorage dev-mode auth
  }

  // Inject __dev_staff__ + English locale before every navigation
  await page.addInitScript((s) => {
    localStorage.setItem('__dev_staff__', JSON.stringify(s));
    const raw = localStorage.getItem('wp-tweaks');
    let existing: { state: Record<string, unknown>; version: number } = { state: {}, version: 3 };
    if (raw) {
      try {
        existing = JSON.parse(raw);
      } catch {
        /* ignore */
      }
    }
    existing.state = { ...existing.state, lang: 'en' };
    localStorage.setItem('wp-tweaks', JSON.stringify(existing));
  }, staff);
}

// ── Exported per-role helpers ─────────────────────────────────────────────────

export async function loginAsAdmin(page: Page): Promise<void> {
  await seedAuth(page, STAFF_ADMIN);
}

export async function loginAsTreasurer(page: Page): Promise<void> {
  await seedAuth(page, STAFF_TREASURER);
}

export async function loginAsOps(page: Page): Promise<void> {
  await seedAuth(page, STAFF_OPS);
}

export async function loginAsViewer(page: Page): Promise<void> {
  await seedAuth(page, STAFF_VIEWER);
}

// ── gotoApp helper (matches real-api-fixture pattern) ────────────────────────

export async function gotoApp(page: Page, path: string): Promise<void> {
  await page.goto(`/app/${path}`);
  await page.waitForSelector('[data-testid="app-layout"], nav, .sidebar, aside, .topbar', {
    timeout: 20_000,
  });
  await page.waitForTimeout(500);
}

// ── Extended test fixture (defaults to admin) ─────────────────────────────────

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    await loginAsAdmin(page);
    await use(page);
  },
});
