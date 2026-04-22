// Smoke: topbar widgets — env picker, wallet widget, bell/notifications, user menu.
// EnvPicker only renders when VITE_ENV_PROFILES is set (MULTI_ENV_ENABLED=true).
// WalletWidget: disconnected state shows "Connect wallet" button → ConnectWalletModal.
// Bell → NotificationsPanel (.notif-panel). UserMenu → .user-menu → Notification settings.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('topbar: env picker, wallet modal, bell panel, user menu notif prefs', async ({ page }) => {
  await seedRealAuth(page);
  await gotoApp(page, 'dashboard');

  await expect(page.locator('.topbar')).toBeVisible({ timeout: 10_000 });

  // Hide TanStack Query devtools SVG if it overlaps topbar buttons
  await page.evaluate(() => {
    const devtools = document.querySelector<HTMLElement>(
      '[class*="devtools"], #tanstack-query-devtools-panel'
    );
    if (devtools) devtools.style.display = 'none';
  });

  // === 1. Env picker (conditional — only when MULTI_ENV_ENABLED) ================
  const envPicker = page.locator('.env-picker').first();
  if (await envPicker.isVisible()) {
    await envPicker.locator('button').first().click();
    const envMenu = page.locator('.env-menu').first();
    await expect(envMenu).toBeVisible({ timeout: 3_000 });
    // At least one environment profile row exists
    await expect(envMenu.locator('.env-menu-item').first()).toBeVisible({ timeout: 3_000 });
    // Close by clicking elsewhere
    await page.locator('.topbar-breadcrumb').click();
    await expect(envMenu).not.toBeVisible({ timeout: 3_000 });
  }
  // Skip if MULTI_ENV_ENABLED=false — single-env mode hides the picker entirely

  // === 2. Wallet widget — "Connect wallet" → modal opens → close ================
  // In test env no wallet is connected, so the disconnected button renders.
  const connectBtn = page.locator('.wallet-widget', { hasText: /connect wallet/i }).first();
  if (await connectBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await connectBtn.click();
    // ConnectWalletModal uses Modal component (.modal class + role="dialog")
    const modal = page.locator('.modal[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    // Close via the modal's own X button (aria-label="Close") — scrim is behind modal content
    const modalClose = modal.locator('button[aria-label="Close"]').first();
    await modalClose.click();
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  }
  // Skip if wallet already connected in test environment

  // === 3. Bell icon → NotificationsPanel opens → close =========================
  const bellBtn = page
    .locator('button[aria-label*="Notification" i], button[title*="Notification" i]')
    .first();
  await expect(bellBtn).toBeVisible({ timeout: 5_000 });
  await bellBtn.click();
  const notifPanel = page.locator('.notif-panel').first();
  await expect(notifPanel).toBeVisible({ timeout: 5_000 });
  // Close by clicking outside the panel (topbar breadcrumb is outside notifRef)
  await page.locator('.topbar-breadcrumb').click();
  await expect(notifPanel).not.toBeVisible({ timeout: 5_000 });

  // === 4. User menu → open → Notification settings → NotifPrefsModal → close ===
  const userMenuTrigger = page.locator('.user-menu-trigger').first();
  await expect(userMenuTrigger).toBeVisible({ timeout: 5_000 });
  await userMenuTrigger.click();

  const userMenu = page.locator('.user-menu').first();
  await expect(userMenu).toBeVisible({ timeout: 3_000 });

  // "Notification settings" menu item (translated key: notifications.prefs.menuItem)
  const notifSettingsItem = userMenu
    .locator('.user-menu-item')
    .filter({ hasText: /notification settings|notification pref/i })
    .first();
  await expect(notifSettingsItem).toBeVisible({ timeout: 3_000 });
  await notifSettingsItem.click();

  // NotifPrefsModal renders via Modal component (.modal class + role="dialog")
  const prefsModal = page.locator('.modal[role="dialog"]').first();
  await expect(prefsModal).toBeVisible({ timeout: 5_000 });

  // Close via the modal's own X button (scrim is behind modal content, intercepted by it)
  const prefsClose = prefsModal.locator('button[aria-label="Close"]').first();
  await prefsClose.click();
  await expect(prefsModal).not.toBeVisible({ timeout: 5_000 });
});
