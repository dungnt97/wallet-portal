// Smoke: recon — snapshots table, run scan → confirm modal → cancel, timeline chart.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('recon smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'recon');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Snapshots table or empty state visible
  await page.waitForTimeout(1_500);
  const tableOrEmpty = await page.locator('table, .text-muted, .card').count();
  expect(tableOrEmpty).toBeGreaterThan(0);

  // "Run scan now" button visible
  const runBtn = page.locator('button', { hasText: /run scan now|run recon|run now/i });
  await expect(runBtn.first()).toBeVisible({ timeout: 10_000 });

  // Click if not disabled → confirm modal → cancel
  const isDisabled = await runBtn.first().isDisabled();
  if (!isDisabled) {
    await runBtn.first().click();
    const modal = page.locator('[role="dialog"], .modal').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    const cancelBtn = modal.locator('button', { hasText: /cancel/i });
    if (await cancelBtn.count()) await cancelBtn.click();
    else await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  }

  // Timeline chart visible (empty OK — just check the container renders)
  const timelineChart = page.locator('.chart-empty-state, canvas, svg, .drift-timeline');
  if (await timelineChart.count())
    await expect(timelineChart.first()).toBeVisible({ timeout: 6_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
