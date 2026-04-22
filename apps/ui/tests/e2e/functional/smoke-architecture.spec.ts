// Smoke: architecture — service map SVG, tab switches (Service map / Jobs / Data flow).
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

  // Default "Service map" tab visible and active
  const serviceMapTab = page.locator('.tab, [role="tab"]', { hasText: /service map/i });
  await expect(serviceMapTab.first()).toBeVisible({ timeout: 8_000 });

  // SVG service map diagram rendered
  const svg = page.locator('.arch-diagram svg, svg[viewBox]').first();
  await expect(svg).toBeVisible({ timeout: 10_000 });

  // Tab switches: Jobs / Data flow (if present)
  const jobsTab = page.locator('.tab, [role="tab"]', { hasText: /jobs/i });
  if (await jobsTab.count()) {
    await jobsTab.first().click();
    // Some content visible after switch
    await page.waitForTimeout(500);
    const content = page.locator('.card, .pro-card, svg, table').first();
    await expect(content).toBeVisible({ timeout: 5_000 });
  }

  const dataFlowTab = page.locator('.tab, [role="tab"]', { hasText: /data flow/i });
  if (await dataFlowTab.count()) {
    await dataFlowTab.first().click();
    await page.waitForTimeout(500);
    const content2 = page.locator('.card, .pro-card, svg, table').first();
    await expect(content2).toBeVisible({ timeout: 5_000 });
  }

  // Return to Service map tab
  await serviceMapTab.first().click();
  await expect(svg).toBeVisible({ timeout: 5_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
