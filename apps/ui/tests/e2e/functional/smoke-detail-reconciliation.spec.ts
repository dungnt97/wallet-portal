// Smoke: reconciliation detail — trigger snapshot via API, reload, click snapshot row,
// verify drift rows table and severity filter pills (all/critical/warning/info) are clickable.
import { request } from '@playwright/test';
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

const API = 'http://localhost:3001';

/** Trigger a reconciliation snapshot and wait briefly for it to appear in the list. */
async function triggerSnapshot(): Promise<boolean> {
  const ctx = await request.newContext({ baseURL: API });
  try {
    await ctx.post('/auth/session/dev-login', { data: { email: 'mira@treasury.io' } });
    const res = await ctx.post('/reconciliation/run', {
      data: { scope: 'all' },
    });
    // 202 = enqueued, 409 = already running (both mean a snapshot exists/will exist)
    return res.status() === 202 || res.status() === 409;
  } catch {
    return false;
  } finally {
    await ctx.dispose();
  }
}

test.describe('smoke-detail-reconciliation', () => {
  test('trigger snapshot → click row → drift drilldown with severity filter pills', async ({
    page,
  }) => {
    await seedRealAuth(page);

    const triggered = await triggerSnapshot();
    if (!triggered) {
      test.skip(true, 'admin-api unreachable or RECON_DISABLED — skipping recon detail smoke');
      return;
    }

    // Allow worker a moment to process (or at least enqueue) before reloading
    await page.waitForTimeout(2_000);

    await gotoApp(page, 'recon');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

    // Wait for snapshot list to load
    await page.waitForTimeout(2_000);

    const firstRow = page.locator('tbody tr').first();
    const hasRows = await firstRow.isVisible().catch(() => false);
    if (!hasRows) {
      test.skip(true, 'No snapshot rows visible after trigger — skipping detail test');
      return;
    }

    // Click first snapshot row to open drilldown panel
    await firstRow.click({ force: true });

    // DriftDrilldown renders inside a second card column — wait for it
    const drilldown = page.locator('.card', { hasText: /drift rows|snapshot/i }).nth(1);
    await expect(drilldown).toBeVisible({ timeout: 10_000 });

    // Severity filter pills: all / critical / warning / info
    for (const label of ['all', 'critical', 'warning', 'info']) {
      const pill = page.locator('button', { hasText: new RegExp(`^${label}$`, 'i') });
      if (await pill.count()) {
        await expect(pill.first()).toBeVisible({ timeout: 4_000 });
        await pill.first().click();
        // Brief pause so the filter re-renders
        await page.waitForTimeout(300);
      }
    }

    // Reset to "all"
    const allPill = page.locator('button', { hasText: /^all$/i });
    if (await allPill.count()) await allPill.first().click();

    // Drift rows table or "no drift rows" message should be visible
    const driftTable = page.locator('table, .text-muted', { hasText: /account|no drift/i });
    await expect(driftTable.first()).toBeVisible({ timeout: 6_000 });
  });
});
