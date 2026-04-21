// Visual regression — Dashboard page
import { expect, gotoApp, test } from '../support/visual-test-base';

test('dashboard full-page screenshot', async ({ page }) => {
  await gotoApp(page, 'dashboard');

  // Wait for KPI grid and chart to render
  await page
    .waitForSelector('.dashboard-kpi, [class*="kpi"], [class*="KpiGrid"], [class*="chart"]', {
      timeout: 10_000,
    })
    .catch(() => {
      // KPI elements may use different class names — proceed anyway
    });

  await expect(page).toHaveScreenshot('dashboard.png', {
    fullPage: true,
    mask: [
      page.locator('[data-testid="timestamp"]'),
      page.locator('[class*="LiveTimeAgo"], [class*="live-time"]'),
      page.locator('[class*="BlockTicker"], [class*="block-ticker"]'),
    ],
  });
});
