// Smoke: shell navigation — sidebar nav clicks, command palette ⌘K, lang switcher, theme toggle, user menu.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('shell navigation smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'dashboard');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Click each sidebar nav item → verify URL changes
  const navItems = page.locator('aside.sidebar .nav-item');
  const count = await navItems.count();
  expect(count).toBeGreaterThan(0);

  // Click first few nav items to verify routing (avoid clicking all to stay under time budget)
  const sampled = Math.min(count, 5);
  for (let i = 0; i < sampled; i++) {
    const item = navItems.nth(i);
    const href = await item.getAttribute('href');
    await item.click();
    if (href) {
      await expect(page).toHaveURL(new RegExp(href.replace('/app/', '')), { timeout: 8_000 });
    }
    await page.waitForTimeout(300);
  }

  // Navigate back to dashboard for remaining checks
  await gotoApp(page, 'dashboard');
  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 10_000 });

  // Command palette ⌘K opens + closes
  // CommandPalette renders .cmd-scrim + .cmd-palette when open
  await page.keyboard.press('Meta+k');
  const cmdPalette = page.locator('.cmd-palette');
  await expect(cmdPalette).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press('Escape');
  await expect(cmdPalette).not.toBeVisible({ timeout: 5_000 });

  // Language switcher — .lang-switcher icon-btn opens .lang-popover
  const langTrigger = page.locator('.lang-switcher .icon-btn');
  if (await langTrigger.count()) {
    await langTrigger.click();
    const langPopover = page.locator('.lang-popover');
    await expect(langPopover).toBeVisible({ timeout: 5_000 });
    // Click VI option then EN to toggle back
    const viOption = langPopover.locator('button', { hasText: /Tiếng Việt/i });
    if (await viOption.count()) await viOption.click();
    await page.waitForTimeout(300);
    await langTrigger.click();
    const enOption = page.locator('.lang-popover button', { hasText: /English/i });
    if (await enOption.count()) await enOption.click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // Theme toggle — icon-btn with title containing "mode" (dark mode / light mode)
  const themeBtn = page.locator('.topbar .icon-btn[title*="mode" i]');
  if (await themeBtn.count()) {
    await themeBtn.first().click();
    await page.waitForTimeout(300);
    await themeBtn.first().click(); // toggle back
  }

  // User menu — .user-menu-trigger opens .user-menu[role="menu"]
  const userMenuTrigger = page.locator('.user-menu-trigger');
  if (await userMenuTrigger.count()) {
    await userMenuTrigger.click();
    const userMenu = page.locator('.user-menu[role="menu"]').first();
    await expect(userMenu).toBeVisible({ timeout: 5_000 });
    // Close by clicking outside
    await page.locator('.topbar-breadcrumb').click();
    await expect(userMenu).not.toBeVisible({ timeout: 5_000 });
  }

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
