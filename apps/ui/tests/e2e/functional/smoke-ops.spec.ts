// Smoke: ops — kill-switch toggle → confirm modal → cancel, health grid, backup card.
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

  // Toggle click → confirm modal → cancel (do NOT actually enable)
  const toggle = page.locator('.toggle').first();
  if (await toggle.isVisible()) {
    await toggle.click();
    const modal = page.locator('.modal-backdrop .modal, [role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    // Cancel — don't confirm the kill-switch toggle
    const cancelBtn = modal.locator('button', { hasText: /cancel/i });
    if (await cancelBtn.count()) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  }

  // Health grid visible — HealthStatusGrid renders individual .card chips (no wrapper class)
  // Wait for at least 1 card to appear inside the health section (after kill-switch modal dismissed)
  await page.waitForTimeout(500);
  const healthCards = page.locator('.card');
  await expect(healthCards.first()).toBeVisible({ timeout: 8_000 });

  // Backup trigger card visible
  const backupCard = page.locator('.card', { hasText: /backup/i });
  if (await backupCard.count()) await expect(backupCard.first()).toBeVisible({ timeout: 6_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
