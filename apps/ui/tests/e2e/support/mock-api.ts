// Mock API interceptor for deterministic visual regression screenshots.
// Intercepts all API, wallet, and policy calls to return static fixture responses.
// Also freezes Date.now() to a fixed timestamp so timestamps are stable.
import type { Page } from '@playwright/test';

/** Fixed ISO timestamp for all "now" references in screenshots. */
export const FIXED_NOW = '2026-04-21T10:00:00.000Z';
export const FIXED_NOW_MS = new Date(FIXED_NOW).getTime(); // 1745229600000

/** Fake admin staff user returned by /auth/me in dev-mode. */
const DEV_STAFF = {
  id: 'stf_mira',
  name: 'Mira Sato',
  email: 'mira@treasury.io',
  role: 'admin',
};

/** Generic paginated wrapper */
function paginated<T>(items: T[]) {
  return { data: items, total: items.length, page: 1, pageSize: 50 };
}

/** Generic empty list response */
function empty() {
  return paginated([]);
}

/** Intercept all API/wallet/policy routes with deterministic fixture data. */
export async function setupMockApi(page: Page): Promise<void> {
  // Freeze Date.now() and new Date() to FIXED_NOW for deterministic timestamps
  await page.addInitScript(`
    const FIXED_NOW = ${FIXED_NOW_MS};
    const OrigDate = window.Date;
    class FakeDate extends OrigDate {
      constructor(...args) {
        if (args.length === 0) {
          super(FIXED_NOW);
        } else {
          super(...args);
        }
      }
      static now() { return FIXED_NOW; }
    }
    // Preserve static methods
    Object.setPrototypeOf(FakeDate, OrigDate);
    window.Date = FakeDate;
  `);

  // Inject animation-disabling stylesheet for stable screenshots
  await page.addInitScript(`
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    // Also handle before DOMContentLoaded
    if (document.head) document.head.appendChild(style);
  `);

  // ── Auth ────────────────────────────────────────────────────────────────────
  await page.route('**/api/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DEV_STAFF),
    });
  });

  await page.route('**/api/auth/session/initiate', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: '/login' }),
    });
  });

  // ── Dashboard / KPIs ────────────────────────────────────────────────────────
  await page.route('**/api/dashboard**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalBalance: 1_181_801.95,
        dailyVolume: 94_200.0,
        pendingWithdrawals: 3,
        activeUsers: 1284,
      }),
    });
  });

  // ── Deposits ────────────────────────────────────────────────────────────────
  await page.route('**/api/deposits**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });

  // ── Withdrawals ─────────────────────────────────────────────────────────────
  await page.route('**/api/withdrawals**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });

  // ── Sweep ───────────────────────────────────────────────────────────────────
  await page.route('**/api/sweep**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });

  // ── Cold storage ────────────────────────────────────────────────────────────
  await page.route('**/api/cold**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });

  // ── Audit ───────────────────────────────────────────────────────────────────
  await page.route('**/api/audit**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });

  // ── Users ───────────────────────────────────────────────────────────────────
  await page.route('**/api/users**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });

  // ── Signers / Staff ─────────────────────────────────────────────────────────
  await page.route('**/api/staff**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });
  await page.route('**/api/signers**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });

  // ── Recovery ────────────────────────────────────────────────────────────────
  await page.route('**/api/recovery**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });

  // ── Reconciliation ──────────────────────────────────────────────────────────
  await page.route('**/api/reconciliation**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });
  await page.route('**/api/recon**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });

  // ── Ops ─────────────────────────────────────────────────────────────────────
  await page.route('**/api/ops**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });

  // ── Multisig / ceremony ─────────────────────────────────────────────────────
  await page.route('**/api/multisig**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty()) });
  });

  // ── Wallet engine passthrough ────────────────────────────────────────────────
  await page.route('**/wallet/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  // ── Policy engine passthrough ────────────────────────────────────────────────
  await page.route('**/policy/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  // ── WebSocket / SSE — abort to prevent hanging connections ──────────────────
  await page.route('**/stream**', (route) => {
    route.abort();
  });
}
