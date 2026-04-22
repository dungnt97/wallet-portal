// Smoke: notifs — channels list, add channel modal kind tabs, routing matrix toggle, send test modal.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('notifs smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'notifs');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Channels list visible
  const channelsList = page.locator('.card, .pro-card, table, ul').first();
  await expect(channelsList).toBeVisible({ timeout: 8_000 });

  // Add channel modal: open → switch kind tabs → cancel
  const addBtn = page.locator('button', { hasText: /add channel/i });
  await expect(addBtn).toBeVisible({ timeout: 8_000 });
  await addBtn.click();

  const modal = page.locator('[role="dialog"], .modal').first();
  await expect(modal).toBeVisible({ timeout: 5_000 });

  // Switch through kind tabs: Email / Slack / PagerDuty / Webhook
  for (const kind of ['Email', 'Slack', 'PagerDuty', 'Webhook']) {
    const kindTab = modal.locator('.tab, [role="tab"], button', { hasText: new RegExp(kind, 'i') });
    if (await kindTab.count()) await kindTab.first().click();
  }

  // Cancel / close
  const cancelBtn = modal.locator('button', { hasText: /cancel/i });
  if (await cancelBtn.count()) {
    await cancelBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await expect(modal).not.toBeVisible({ timeout: 5_000 });

  // Routing matrix: click 1 cell → optimistic toggle (may not be visible with no channels)
  const routingCell = page.locator('.toggle, input[type="checkbox"]').first();
  if (await routingCell.isVisible()) await routingCell.click();

  // Send test modal: open → close (button may only appear when channels exist)
  const sendTestBtn = page.locator('button', { hasText: /send test/i });
  if (await sendTestBtn.count()) {
    await sendTestBtn.first().click();
    const testModal = page.locator('[role="dialog"], .modal').first();
    await expect(testModal).toBeVisible({ timeout: 5_000 });
    const closeBtn = testModal.locator('button', { hasText: /cancel|close/i });
    if (await closeBtn.count()) await closeBtn.first().click();
    else await page.keyboard.press('Escape');
    await expect(testModal).not.toBeVisible({ timeout: 5_000 });
  }

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
