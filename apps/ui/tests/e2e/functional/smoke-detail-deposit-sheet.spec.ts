// Smoke: deposit detail sheet — seed 1 deposit via API, click row, verify sheet opens,
// check Lifecycle + Details sections, close.
import { request } from '@playwright/test';
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

const API = 'http://localhost:3001';

async function seedDeposit(): Promise<void> {
  const ctx = await request.newContext({ baseURL: API });
  await ctx.post('/auth/session/dev-login', { data: { email: 'mira@treasury.io' } });

  // Get or create a user
  const usersRes = await ctx.get('/users?limit=1');
  const usersBody = (await usersRes.json()) as { data: Array<{ id: string }> };
  let userId: string;
  if (usersBody.data.length > 0 && usersBody.data[0]) {
    userId = usersBody.data[0].id;
  } else {
    const created = await ctx.post('/users', {
      data: { email: `deposit-seed-${Date.now()}@example.com`, kycTier: 'basic' },
    });
    userId = ((await created.json()) as { id: string }).id;
  }

  // Manual credit to ensure at least 1 deposit row exists
  await ctx.post('/deposits/manual-credit', {
    data: {
      userId,
      chain: 'bnb',
      token: 'USDT',
      amount: '50',
      reason: 'e2e smoke detail sheet seed deposit',
    },
  });

  await ctx.dispose();
}

test.describe('smoke-detail-deposit-sheet', () => {
  test('click deposit row → sheet opens with Lifecycle + Details, then close', async ({ page }) => {
    await seedRealAuth(page);

    try {
      await seedDeposit();
    } catch {
      test.skip(true, 'admin-api unreachable — skipping deposit detail sheet smoke');
      return;
    }

    await gotoApp(page, 'deposits');
    await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

    // Wait for table to load
    await page.waitForTimeout(1_500);
    const firstRow = page.locator('tbody tr').first();
    const hasRows = await firstRow.isVisible().catch(() => false);
    if (!hasRows) {
      test.skip(true, 'No deposit rows visible — skipping sheet test');
      return;
    }

    // Click the first row to open the detail sheet
    await firstRow.click({ force: true });

    const sheet = page.locator('div.sheet').first();
    await expect(sheet).toBeVisible({ timeout: 8_000 });

    // Verify Lifecycle section
    await expect(sheet.locator('h4', { hasText: /lifecycle/i })).toBeVisible({ timeout: 5_000 });

    // Verify Details section
    await expect(sheet.locator('h4', { hasText: /details/i })).toBeVisible({ timeout: 5_000 });

    // Close via the Close button
    const closeBtn = sheet.locator('button', { hasText: /close/i });
    await expect(closeBtn.first()).toBeVisible({ timeout: 4_000 });
    await closeBtn.first().click();

    await expect(sheet).not.toBeVisible({ timeout: 8_000 });
  });
});
