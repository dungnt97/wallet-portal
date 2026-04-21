// Visual regression — Audit log page
import { expect, gotoApp, test } from '../support/visual-test-base';

test('audit log full-page screenshot', async ({ page }) => {
  await gotoApp(page, 'audit');

  await page
    .waitForSelector('table, [class*="empty"], [class*="Empty"], [class*="audit"]', {
      timeout: 10_000,
    })
    .catch(() => {});

  await expect(page).toHaveScreenshot('audit.png', {
    fullPage: true,
    mask: [
      page.locator('[data-testid="timestamp"]'),
      // Audit timestamps change — mask the time column
      page.locator('td:last-child, [class*="timestamp"], [class*="time"]'),
    ],
  });
});
