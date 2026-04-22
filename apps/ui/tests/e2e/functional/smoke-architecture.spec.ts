// Smoke: architecture page loads with service-map SVG visible.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('architecture smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'architecture');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Tab bar should show "Service map" tab (default active)
  const serviceMapTab = page.locator('.tab, [role="tab"]', { hasText: /service map/i });
  await expect(serviceMapTab.first()).toBeVisible({ timeout: 8_000 });

  // SVG service map diagram should be rendered
  const svg = page.locator('.arch-diagram svg, svg[viewBox]').first();
  await expect(svg).toBeVisible({ timeout: 10_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
