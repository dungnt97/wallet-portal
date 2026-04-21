// Dev-mode auth fixture — seeds the browser with a valid staff session cookie
// so LoginGate passes without a real OIDC flow.
//
// Requires the Vite dev server to be started with VITE_AUTH_DEV_MODE=true
// (set in playwright.config.ts webServer.env).
//
// When VITE_AUTH_DEV_MODE=true the AuthProvider reads a pre-seeded localStorage
// key instead of calling /auth/me. We inject that key here before navigation.
import type { Page } from '@playwright/test';

export interface DevStaff {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'treasurer' | 'viewer';
}

/** Default admin staff used for most visual regression tests. */
export const DEV_ADMIN: DevStaff = {
  id: 'stf_mira',
  name: 'Mira Sato',
  email: 'mira@treasury.io',
  role: 'admin',
};

/**
 * Seeds the page's localStorage with a fake staff session so AuthProvider
 * hydrates immediately without an /auth/me round-trip.
 *
 * Call this before page.goto() so the value is present on first load.
 */
export async function seedDevAuth(page: Page, staff: DevStaff = DEV_ADMIN): Promise<void> {
  await page.addInitScript((s) => {
    // AuthProvider checks this key when VITE_AUTH_DEV_MODE=true
    localStorage.setItem('__dev_staff__', JSON.stringify(s));
  }, staff);
}
