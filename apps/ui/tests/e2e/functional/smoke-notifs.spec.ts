// Smoke: notifs page loads, "+Add channel" button clickable → modal opens.
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

  // Add channel button opens modal
  const addBtn = page.locator('button', { hasText: /add channel/i });
  await expect(addBtn).toBeVisible({ timeout: 8_000 });
  await addBtn.click();

  const modal = page.locator('.modal[role="dialog"]').first();
  await expect(modal).toBeVisible({ timeout: 5_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
