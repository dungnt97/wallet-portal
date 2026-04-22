// Smoke: ops page loads with kill-switch card visible.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('ops smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'ops');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Kill-switch card visible for admin
  const ksCard = page.locator('.card', { hasText: /kill switch|outbound/i }).first();
  await expect(ksCard).toBeVisible({ timeout: 10_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
