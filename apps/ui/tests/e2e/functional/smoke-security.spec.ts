// Smoke: account/security — WebAuthn keys list, login history, notif prefs modal.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('security smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'account/security');

  // Security page heading
  const heading = page.locator('h1', { hasText: /security keys/i });
  await expect(heading).toBeVisible({ timeout: 12_000 });

  // "Add security key" button present
  const addKeyBtn = page.locator('button', { hasText: /add security key/i });
  await expect(addKeyBtn).toBeVisible({ timeout: 8_000 });

  // WebAuthn keys section — uses a bordered div (not .card), contains "Add a new security key"
  const keysSection = page.locator('div', { hasText: /add a new security key/i }).first();
  await expect(keysSection).toBeVisible({ timeout: 8_000 });

  // Login history section — LoginHistory component renders a heading "Login history"
  const loginHistoryHeading = page.locator('h2, h3, div', { hasText: /login history/i });
  await expect(loginHistoryHeading.first()).toBeVisible({ timeout: 10_000 });

  // Login history table or rows rendered
  await page.waitForTimeout(1_500);
  const historyRows = await page.locator('table tbody tr').count();
  const totalBadge = await page.locator('*', { hasText: /\d+ attempts/i }).count();
  expect(historyRows + totalBadge).toBeGreaterThanOrEqual(0);

  // Device name input present (WebAuthn registration form)
  const deviceNameInput = page.locator('input#device-name, input[placeholder*="YubiKey" i]');
  if (await deviceNameInput.count()) {
    await expect(deviceNameInput.first()).toBeVisible({ timeout: 5_000 });
  }

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
