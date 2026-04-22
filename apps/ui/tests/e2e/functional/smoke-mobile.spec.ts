// Smoke: mobile viewport 375×667 — 5 critical pages, hamburger sidebar toggle, heading visible.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

const MOBILE_VIEWPORT = { width: 375, height: 667 };

const CRITICAL_PAGES = ['dashboard', 'deposits', 'withdrawals', 'cold', 'ops'] as const;

for (const pageName of CRITICAL_PAGES) {
  test(`mobile smoke — ${pageName}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize(MOBILE_VIEWPORT);
    await seedRealAuth(page);
    await gotoApp(page, pageName);

    // Page heading visible on mobile
    await expect(page.locator('h1, .page-title, .crumb-current').first()).toBeVisible({
      timeout: 12_000,
    });

    // Sidebar hamburger toggle — topbar icon-btn that toggles mobile nav
    const hamburger = page.locator('.topbar .icon-btn').first();
    await expect(hamburger).toBeVisible({ timeout: 8_000 });

    // Open mobile nav
    await hamburger.click();
    const mobileNav = page.locator('.mobile-nav-drawer, .mobile-nav-scrim, aside.sidebar');
    await expect(mobileNav.first()).toBeVisible({ timeout: 5_000 });

    // Close mobile nav by clicking scrim or a nav link
    const scrim = page.locator('.mobile-nav-scrim');
    if (await scrim.isVisible()) {
      await scrim.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(page.locator('.mobile-nav-scrim')).not.toBeVisible({ timeout: 5_000 });

    expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
  });
}
