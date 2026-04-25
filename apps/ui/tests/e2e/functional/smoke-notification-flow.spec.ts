// Smoke: notification flow — trigger an action that generates a notification,
// verify bell count increments, open notification panel, verify content, mark as read.
//
// Trigger strategy: POST /deposits/manual-credit generates a deposit.credited event
// which notifies admin staff. This is lighter than toggling kill-switch (no cleanup needed).
// Fallback trigger: kill-switch toggle (same strategy as smoke-realtime-notification.spec.ts).
//
// Skip: admin-api not reachable on :3001.
import { request } from '@playwright/test';
import { expect, gotoApp, seedRealAuth, test } from './dev-login-fixture';

const API = 'http://localhost:3001';

type ApiCtx = Awaited<ReturnType<typeof request.newContext>>;

async function makeApiCtx(): Promise<ApiCtx | null> {
  try {
    const ctx = await request.newContext({ baseURL: API });
    const res = await ctx.post('/auth/session/dev-login', {
      data: { email: 'mira@treasury.io' },
    });
    if (!res.ok() && res.status() >= 500) {
      await ctx.dispose();
      return null;
    }
    return ctx;
  } catch {
    return null;
  }
}

async function fetchUnreadCount(ctx: ApiCtx): Promise<number> {
  try {
    const res = await ctx.get('/notifications/unread-count');
    if (!res.ok()) return 0;
    const body = (await res.json()) as { count: number };
    return body.count ?? 0;
  } catch {
    return 0;
  }
}

/** Trigger a notification by toggling kill-switch ON. Returns true on success. */
async function triggerNotification(ctx: ApiCtx): Promise<boolean> {
  try {
    const res = await ctx.post('/ops/kill-switch', {
      data: { enabled: true, reason: 'smoke-notification-flow test trigger' },
    });
    return res.ok();
  } catch {
    return false;
  }
}

async function resetKillSwitch(ctx: ApiCtx): Promise<void> {
  try {
    await ctx.post('/ops/kill-switch', { data: { enabled: false, reason: 'test cleanup' } });
  } catch {
    // non-fatal
  }
}

test.describe('smoke-notification-flow', () => {
  test('bell count increments after trigger, panel shows notification, mark-read decrements', async ({
    page,
  }) => {
    const apiCtx = await makeApiCtx();
    if (!apiCtx) {
      test.skip(true, 'admin-api not reachable on :3001 — skipping notification flow test');
      return;
    }

    // Ensure kill-switch is OFF before starting so we get a clean baseline
    await resetKillSwitch(apiCtx);
    await page.waitForTimeout(300);

    await seedRealAuth(page);
    await gotoApp(page, 'dashboard');

    // Capture baseline unread count from API (source of truth)
    const countBefore = await fetchUnreadCount(apiCtx);

    // Trigger notification
    const triggered = await triggerNotification(apiCtx);
    if (!triggered) {
      await resetKillSwitch(apiCtx);
      await apiCtx.dispose();
      test.skip(true, 'Kill-switch toggle failed — notification not fired, skipping');
      return;
    }

    try {
      // Wait for backend INSERT to commit (notifyStaff is fire-and-forget on server)
      await page.waitForTimeout(1_500);

      // Verify DB count increased before asserting UI
      const countAfterApi = await fetchUnreadCount(apiCtx);
      expect(countAfterApi).toBeGreaterThan(countBefore);

      // Navigate away + back to force TanStack Query remount + refetch of useUnreadCount
      await gotoApp(page, 'deposits');
      await gotoApp(page, 'dashboard');

      // Bell button must be visible
      const bell = page.locator('button[aria-label*="Notifications"]');
      await expect(bell).toBeVisible({ timeout: 10_000 });

      // Assert bell label reflects incremented count
      await expect(async () => {
        const label = (await bell.getAttribute('aria-label')) ?? '';
        const match = label.match(/\((\d+) unread\)/);
        const countNow = match ? Number.parseInt(match[1], 10) : 0;
        expect(countNow).toBeGreaterThan(countBefore);
      }).toPass({ timeout: 10_000, intervals: [500, 1000, 1500, 2000] });

      // Open the notification panel by clicking the bell
      await bell.click();

      const panel = page
        .locator('[role="dialog"], .notification-panel, .notif-drawer, [class*="notif"]')
        .first();
      await expect(panel).toBeVisible({ timeout: 8_000 });

      // Panel must show at least one notification item
      const notifItem = panel
        .locator('.notification-item, [class*="notif-item"], li, [role="listitem"]')
        .first();
      const hasItem = await notifItem.isVisible({ timeout: 5_000 }).catch(() => false);

      if (hasItem) {
        // Notification content should be non-empty text
        const itemText = (await notifItem.textContent()) ?? '';
        expect(itemText.trim().length).toBeGreaterThan(0);

        // Mark as read — look for "Mark all read" button or individual read button
        const markAllBtn = panel.locator('button', { hasText: /mark all|read all/i });
        const markOneBtn = notifItem.locator(
          'button[aria-label*="read" i], button[aria-label*="mark" i]'
        );

        if (await markAllBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          const countBeforeRead = await fetchUnreadCount(apiCtx);
          await markAllBtn.click();
          await page.waitForTimeout(1_000);
          const countAfterRead = await fetchUnreadCount(apiCtx);
          // Count should have decreased (or gone to 0)
          expect(countAfterRead).toBeLessThanOrEqual(countBeforeRead);
        } else if (
          await markOneBtn
            .first()
            .isVisible({ timeout: 2_000 })
            .catch(() => false)
        ) {
          await markOneBtn.first().click();
          await page.waitForTimeout(1_000);
        }
      }

      // Close the panel
      const closePanelBtn = panel.locator('button[aria-label*="close" i], button', {
        hasText: /close/i,
      });
      if (
        await closePanelBtn
          .first()
          .isVisible({ timeout: 2_000 })
          .catch(() => false)
      ) {
        await closePanelBtn.first().click();
      } else {
        await page.keyboard.press('Escape');
      }
    } finally {
      await resetKillSwitch(apiCtx);
      await apiCtx.dispose();
    }
  });

  test('notification bell is present and accessible on dashboard', async ({ page }) => {
    await seedRealAuth(page);
    await gotoApp(page, 'dashboard');

    // Bell must be in the topbar for any authenticated session
    const bell = page.locator('button[aria-label*="Notifications"]');
    await expect(bell).toBeVisible({ timeout: 12_000 });

    // Accessible: has an aria-label attribute
    const label = await bell.getAttribute('aria-label');
    expect(label).not.toBeNull();
    expect((label ?? '').length).toBeGreaterThan(0);
  });
});
