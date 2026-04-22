// Smoke: multisig page loads with vault cards visible.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test('multisig smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await seedRealAuth(page);
  await gotoApp(page, 'multisig');

  await expect(page.locator('h1, .page-title').first()).toBeVisible({ timeout: 12_000 });

  // Vault cards (BSC + Solana) should render
  const vaultCards = page.locator('.card', { hasText: /BSC|Solana|Safe|Squads/i });
  await expect(vaultCards.first()).toBeVisible({ timeout: 10_000 });

  // Sync / retry button should be present (may be disabled while loading)
  const syncBtn = page.locator('button', { hasText: /retry|sync|thử lại/i });
  await expect(syncBtn.first()).toBeVisible({ timeout: 8_000 });

  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
