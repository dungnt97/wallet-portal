// Smoke UX: theme dark-mode toggle — verify data-theme attribute flips on <html>.
// Topbar renders theme toggle button (title contains "mode") only on non-xs viewports.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('theme toggle: light → dark → light', async ({ page }) => {
  // Seed as English so selectors are predictable
  await seedRealAuth(page);

  // Force light theme in localStorage before navigation
  await page.addInitScript(() => {
    const raw = localStorage.getItem('wp-tweaks');
    let stored: { state: Record<string, unknown>; version: number } = { state: {}, version: 3 };
    if (raw) {
      try {
        stored = JSON.parse(raw);
      } catch {
        /* ignore */
      }
    }
    stored.state = { ...stored.state, theme: 'light' };
    localStorage.setItem('wp-tweaks', JSON.stringify(stored));
  });

  await gotoApp(page, 'dashboard');

  // Wait for topbar to be ready
  await expect(page.locator('.topbar')).toBeVisible({ timeout: 10_000 });

  // Confirm starting theme is light
  const htmlThemeBefore = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme')
  );
  expect(htmlThemeBefore).toBe('light');

  // Locate theme toggle button — title is "Dark mode" (light → switch to dark)
  const themeBtn = page.locator('.topbar .icon-btn[title*="mode" i]').first();
  await expect(themeBtn).toBeVisible({ timeout: 8_000 });
  await themeBtn.click();

  // After click: data-theme should be "dark"
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')), {
      timeout: 5_000,
    })
    .toBe('dark');

  // Toggle back to light
  await themeBtn.click();

  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')), {
      timeout: 5_000,
    })
    .toBe('light');
});
