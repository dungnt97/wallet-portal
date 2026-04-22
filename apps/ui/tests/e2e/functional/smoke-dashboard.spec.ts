// Smoke: dashboard page loads with heading + KPI visible.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('dashboard smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'dashboard');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // KPI grid should render
  const kpi = page.locator('.kpi-grid, .kpi-strip, .stat-card, [class*="kpi"]').first();
  await expect(kpi).toBeVisible({ timeout: 12_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
