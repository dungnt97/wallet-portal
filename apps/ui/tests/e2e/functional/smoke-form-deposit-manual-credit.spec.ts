import { request } from '@playwright/test';
// Smoke: deposit manual credit — open modal, fill form, submit, assert toast + row.
// If user list is empty, creates a seed user via API first.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

async function getOrCreateUserId(): Promise<string> {
  const ctx = await request.newContext({ baseURL: 'http://localhost:3001' });
  await ctx.post('/auth/session/dev-login', { data: { email: 'mira@treasury.io' } });

  const res = await ctx.get('/users?limit=1');
  const body = (await res.json()) as { data: Array<{ id: string }> };

  if (body.data.length > 0) {
    const id = body.data[0].id;
    await ctx.dispose();
    return id;
  }

  // Seed a user so the form has a valid target
  const create = await ctx.post('/users', {
    data: { email: `credit-seed-${Date.now()}@example.com`, kycTier: 'basic' },
  });
  const created = (await create.json()) as { id: string };
  await ctx.dispose();
  return created.id;
}

test.describe('smoke-form-deposit-manual-credit', () => {
  test.beforeEach(async ({ page }) => {
    await seedRealAuth(page);
  });

  test('fill manual credit form → submit → toast success → deposit row visible', async ({
    page,
  }) => {
    let userId: string;
    try {
      userId = await getOrCreateUserId();
    } catch {
      test.skip(true, 'admin-api unreachable — skipping manual credit smoke');
      return;
    }

    await gotoApp(page, 'deposits');

    const creditBtn = page.locator('button', { hasText: /manual credit/i });
    await expect(creditBtn).toBeVisible({ timeout: 10_000 });
    await creditBtn.click();

    const modal = page.locator('.modal-overlay, [role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // User ID
    await modal.locator('#mc-user-id').fill(userId);

    // Chain — select BNB (already default, but be explicit)
    await modal.locator('#mc-chain').selectOption('bnb');

    // Token — USDT
    await modal.locator('#mc-token').selectOption('USDT');

    // Amount
    await modal.locator('#mc-amount').fill('1000');

    // Reason — minimum 20 chars
    await modal.locator('#mc-reason').fill('e2e test credit with at least 20 chars here');

    // Submit button enabled once isValid passes
    const submitBtn = modal.locator('button.btn-accent').last();
    await expect(submitBtn).toBeEnabled({ timeout: 4_000 });
    await submitBtn.click();

    // Modal closes on success
    await expect(modal).not.toBeVisible({ timeout: 15_000 });

    // Success toast
    await expect(page.locator('.toast.success, .toast-success')).toBeVisible({ timeout: 10_000 });

    // At least one deposit row should now be visible
    await page.waitForTimeout(1_000); // allow react-query refetch
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });
  });
});
