// Smoke: auth login — /login page renders, dev-login as Mira → dashboard, topbar name.
import { expect, test } from '@playwright/test';

test.describe('smoke-auth-login', () => {
  test('login page renders heading + Google button + demo account cards', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('.login-root', { timeout: 10_000 });

    // Page heading (English or Vietnamese — either is valid)
    const heading = page.locator('h1.login-title');
    await expect(heading.first()).toBeVisible({ timeout: 8_000 });

    // Google / OIDC button
    const googleBtn = page.locator('button.login-google');
    await expect(googleBtn).toBeVisible({ timeout: 5_000 });

    // Demo account cards (dev-mode right column)
    const cards = page.locator('.login-account-card');
    await expect(cards.first()).toBeVisible({ timeout: 5_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('dev quick-login as Mira redirects to /app/dashboard and topbar shows Mira', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForSelector('.login-account-card', { timeout: 10_000 });

    // Click Mira Sato quick-login card
    const miraCard = page.locator('.login-account-card', { hasText: 'Mira Sato' });
    await expect(miraCard).toBeVisible();
    await miraCard.click();

    // Should redirect to dashboard
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 });

    // Topbar user-menu trigger shows first name
    const trigger = page.locator('.user-menu-trigger');
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await expect(trigger).toContainText('Mira');
  });

  test('unauthenticated navigation to /app/dashboard redirects to /login', async ({ page }) => {
    // No __dev_staff__ seeded — LoginGate should redirect
    await page.goto('/app/dashboard');
    await page.waitForURL('**/login', { timeout: 10_000 });
    await expect(page.locator('.login-root').first()).toBeVisible();
  });
});
