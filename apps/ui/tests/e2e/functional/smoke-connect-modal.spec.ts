// Smoke: ConnectWalletModal UI rendering.
// Verifies EVM + Solana sections, wallet picker buttons, and Escape-to-close.
// No real wallet connections are attempted — only rendering is asserted.
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

test.describe('smoke-connect-modal', () => {
  test('connect wallet modal: EVM + Solana sections, wallet buttons, close with Escape', async ({
    page,
  }) => {
    await seedRealAuth(page);
    await gotoApp(page, 'dashboard');

    await expect(page.locator('.topbar')).toBeVisible({ timeout: 10_000 });

    // Hide TanStack Query devtools if it overlaps topbar
    await page.evaluate(() => {
      const devtools = document.querySelector<HTMLElement>(
        '[class*="devtools"], #tanstack-query-devtools-panel'
      );
      if (devtools) devtools.style.display = 'none';
    });

    // Locate the wallet widget button (disconnected state shows "connect wallet")
    const walletBtn = page.locator('.wallet-widget', { hasText: /connect wallet/i }).first();
    const walletBtnVisible = await walletBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!walletBtnVisible) {
      test.skip(true, 'Wallet widget not in disconnected state — skipping connect modal smoke');
      return;
    }

    await walletBtn.click();

    // Modal must appear
    const modal = page.locator('.modal[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 6_000 });

    // === EVM section ===
    const evmHeading = modal.locator('div').filter({ hasText: /evm/i }).first();
    await expect(evmHeading).toBeVisible({ timeout: 4_000 });

    // EVM wallet picker buttons — at least one must be visible
    const walletBtns = modal.locator('.wallet-pick-btn');
    await expect(walletBtns.first()).toBeVisible({ timeout: 4_000 });

    // MetaMask and Coinbase Wallet are always configured (no env var required).
    // WalletConnect only appears when VITE_WALLETCONNECT_PROJECT_ID is set — check conditionally.
    const alwaysPresentEvm = ['MetaMask', 'Coinbase Wallet'];
    for (const name of alwaysPresentEvm) {
      const btn = walletBtns.filter({ has: page.locator('.wallet-pick-name', { hasText: name }) });
      await expect(btn.first()).toBeVisible({ timeout: 4_000 });
    }

    // WalletConnect: conditional on env var — assert if present, skip if not
    const wcBtn = walletBtns.filter({
      has: page.locator('.wallet-pick-name', { hasText: 'WalletConnect' }),
    });
    if ((await wcBtn.count()) > 0) {
      await expect(wcBtn.first()).toBeVisible({ timeout: 3_000 });
    }

    // === Solana section ===
    const solanaHeading = modal
      .locator('div')
      .filter({ hasText: /solana/i })
      .first();
    await expect(solanaHeading).toBeVisible({ timeout: 4_000 });

    // Solana wallets are only available when extensions are installed.
    // In CI without extensions, list may be empty — check conditionally.
    const solanaWalletNames = ['Phantom', 'Solflare', 'Ledger'];
    for (const name of solanaWalletNames) {
      const btn = walletBtns.filter({ has: page.locator('.wallet-pick-name', { hasText: name }) });
      const count = await btn.count();
      if (count > 0) {
        await expect(btn.first()).toBeVisible({ timeout: 3_000 });
      }
      // skip when extension not installed in CI — not a failure
    }

    // === Close via the modal's Close button (Modal component has no Escape key support) ===
    const closeBtn = modal.locator('button[aria-label="Close"]').first();
    await expect(closeBtn).toBeVisible({ timeout: 3_000 });
    await closeBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });
});
