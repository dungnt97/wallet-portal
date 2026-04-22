// Smoke UX: i18n language switch EN ↔ VI.
// The topbar breadcrumb reflects the page title translation; dashboard title is
// "Dashboard" (EN) vs "Tổng quan" (VI) — a reliable non-empty diff.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('i18n switch: EN → VI → EN via lang switcher', async ({ page }) => {
  // seedRealAuth forces lang=en in wp-tweaks localStorage
  await seedRealAuth(page);
  await gotoApp(page, 'dashboard');

  await expect(page.locator('.topbar')).toBeVisible({ timeout: 10_000 });

  // English breadcrumb: page title should be "Dashboard"
  const breadcrumb = page.locator('.topbar-breadcrumb .crumb-current');
  await expect(breadcrumb).toBeVisible({ timeout: 8_000 });
  await expect(breadcrumb).toContainText('Dashboard', { timeout: 5_000 });

  // Open lang switcher popover
  const langTrigger = page.locator('.lang-switcher .icon-btn').first();
  await expect(langTrigger).toBeVisible({ timeout: 5_000 });
  await langTrigger.click();

  const langPopover = page.locator('.lang-popover');
  await expect(langPopover).toBeVisible({ timeout: 3_000 });

  // Click "Tiếng Việt" option
  const viOption = langPopover.locator('button', { hasText: /Ti.ng Vi.t/i });
  await expect(viOption).toBeVisible({ timeout: 3_000 });
  await viOption.click();

  // Popover should close
  await expect(langPopover).not.toBeVisible({ timeout: 3_000 });

  // Breadcrumb should now show Vietnamese page title "Tổng quan"
  await expect(breadcrumb).not.toContainText('Dashboard', { timeout: 5_000 });
  await expect(breadcrumb).toContainText('Tổng quan', { timeout: 5_000 });

  // Switch back to English
  await langTrigger.click();
  const langPopoverAgain = page.locator('.lang-popover');
  await expect(langPopoverAgain).toBeVisible({ timeout: 3_000 });

  const enOption = langPopoverAgain.locator('button', { hasText: /English/i });
  await expect(enOption).toBeVisible({ timeout: 3_000 });
  await enOption.click();

  await expect(langPopoverAgain).not.toBeVisible({ timeout: 3_000 });
  await expect(breadcrumb).toContainText('Dashboard', { timeout: 5_000 });
});
