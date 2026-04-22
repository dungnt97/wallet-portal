// Smoke: users page loads, Add user button clickable → modal opens.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('users smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'users');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Switch to End users tab then click Add user
  const endUsersTab = page.locator('.tab, [role="tab"]', { hasText: /end users/i });
  await expect(endUsersTab).toBeVisible({ timeout: 8_000 });
  await endUsersTab.click();

  const addUserBtn = page.locator('button', { hasText: /add user/i });
  await expect(addUserBtn).toBeEnabled({ timeout: 5_000 });
  await addUserBtn.click();

  const modal = page.locator('.modal[role="dialog"]').first();
  await expect(modal).toBeVisible({ timeout: 5_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
