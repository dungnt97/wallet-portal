// Smoke: dashboard — KPI grid, chart tabs, range buttons, holdings, alerts.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('dashboard smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'dashboard');

  // Page heading
  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // KPI grid — 4 cards
  const kpiGrid = page.locator('.kpi-grid');
  await expect(kpiGrid).toBeVisible({ timeout: 12_000 });
  const kpiCards = kpiGrid.locator('.kpi');
  await expect(kpiCards).toHaveCount(4, { timeout: 8_000 });

  // Chart section visible
  const chartCard = page.locator('.pro-card').first();
  await expect(chartCard).toBeVisible({ timeout: 8_000 });

  // Click 3 chart metric tabs: AUM / Deposits / Withdrawals
  const aumTab = page.locator('.pro-tab', { hasText: /AUM/i });
  await expect(aumTab.first()).toBeVisible({ timeout: 6_000 });
  await aumTab.first().click();

  const depTab = page.locator('.pro-tab', { hasText: /Deposits/i });
  await expect(depTab.first()).toBeVisible();
  await depTab.first().click();

  const wdTab = page.locator('.pro-tab', { hasText: /Withdrawals/i });
  await expect(wdTab.first()).toBeVisible();
  await wdTab.first().click();
  // Back to AUM
  await aumTab.first().click();

  // Click 4 range segmented buttons (24h / 7d / 30d / 90d)
  const seg = page.locator('.segmented, [role="group"]').first();
  await expect(seg).toBeVisible({ timeout: 6_000 });
  for (const label of ['24h', '7d', '30d', '90d']) {
    const btn = seg.locator('button, label', { hasText: label });
    if (await btn.count()) await btn.first().click();
  }

  // Holdings list — at least 1 row
  const holdings = page.locator('.holdings-list');
  await expect(holdings).toBeVisible({ timeout: 8_000 });
  const holdingRows = holdings.locator('.holdings-row');
  await expect(holdingRows.first()).toBeVisible({ timeout: 6_000 });

  // Alerts panel visible
  const alertsCard = page.locator('.card, .pro-card', { hasText: /alerts/i });
  await expect(alertsCard.first()).toBeVisible({ timeout: 8_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
