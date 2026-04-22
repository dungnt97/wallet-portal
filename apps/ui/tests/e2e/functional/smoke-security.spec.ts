// Smoke: account/security page loads with WebAuthn keys section + login history visible.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('security smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'account/security');

  // Security page uses h1 directly (no PageFrame wrapper)
  const heading = page.locator('h1', { hasText: /security keys/i });
  await expect(heading).toBeVisible({ timeout: 12_000 });

  // "Add security key" button present
  const addKeyBtn = page.locator('button', { hasText: /add security key/i });
  await expect(addKeyBtn).toBeVisible({ timeout: 8_000 });

  // Login history card renders (may be loading or show empty state)
  const loginHistorySection = page.locator('.card, .pro-card', { hasText: /login history/i });
  await expect(loginHistorySection.first()).toBeVisible({ timeout: 10_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
