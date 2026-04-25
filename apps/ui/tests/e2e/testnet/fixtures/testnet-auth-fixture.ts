/**
 * Playwright fixture that combines real-API auth (dev-mode session) with
 * testnet chain clients and env validation.
 *
 * Extends the base Playwright test with:
 *   - `tnEnv`   — validated TestnetEnv (throws if any secret is missing)
 *   - `bnbClient` — { provider, wallet } for Chapel interactions
 *   - `solClient` — { connection, deployer } for Devnet interactions
 *   - Page auto-seeded with dev-mode admin session + English locale
 *
 * Usage:
 *   import { test, expect } from '../fixtures/testnet-auth-fixture';
 *   test('...', async ({ page, tnEnv, bnbClient }) => { ... });
 */
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { JsonRpcProvider, Wallet } from 'ethers';
import type { Connection, Keypair } from '@solana/web3.js';

import { loadTestnetEnv, type TestnetEnv } from './testnet-env.js';
import {
  makeBnbClient,
  makeSolConnection,
  solKeypairFromBase64,
} from './testnet-chain-client.js';

// ── Auth helpers (inline to avoid circular import) ────────────────────────────

const DEV_ADMIN = {
  id: 'stf_mira',
  name: 'Mira Sato',
  email: 'mira@treasury.io',
  role: 'admin' as const,
};

const DEV_TREASURER_0 = {
  id: 'stf_ben',
  name: 'Ben Foster',
  email: 'ben@treasury.io',
  role: 'treasurer' as const,
};

const DEV_TREASURER_1 = {
  id: 'stf_hana',
  name: 'Hana Petersen',
  email: 'hana@treasury.io',
  role: 'treasurer' as const,
};

export { DEV_ADMIN, DEV_TREASURER_0, DEV_TREASURER_1 };
export { expect };

/**
 * Seed the browser page with a real admin session + English locale.
 * Call before page.goto() so the init script fires on first navigation.
 */
export async function seedRealAuth(
  page: Page,
  adminApiUrl: string,
  staff = DEV_ADMIN
): Promise<void> {
  // Real server-side session cookie so backend API calls succeed
  try {
    await page.context().request.post(`${adminApiUrl}/auth/session/dev-login`, {
      data: { email: staff.email },
    });
  } catch {
    // Non-fatal: UI falls back to client-side dev-mode auth
  }

  // Seed localStorage: staff identity + English locale
  await page.addInitScript((s) => {
    localStorage.setItem('__dev_staff__', JSON.stringify(s));
    const raw = localStorage.getItem('wp-tweaks');
    let existing: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 3,
    };
    if (raw) {
      try {
        existing = JSON.parse(raw);
      } catch {
        // ignore
      }
    }
    existing.state = { ...existing.state, lang: 'en' };
    localStorage.setItem('wp-tweaks', JSON.stringify(existing));
  }, staff);
}

/**
 * Navigate to /app/<path> and wait for the shell layout to be ready.
 */
export async function gotoApp(page: Page, path: string): Promise<void> {
  await page.goto(`/app/${path}`);
  await page.waitForSelector('[data-testid="app-layout"], nav, .sidebar, aside, .topbar', {
    timeout: 20_000,
  });
  await page.waitForTimeout(300);
}

// ── Fixture types ─────────────────────────────────────────────────────────────

export interface BnbClient {
  provider: JsonRpcProvider;
  wallet: Wallet; // deployer wallet
}

export interface SolClient {
  connection: Connection;
  deployer: Keypair;
}

export interface TestnetFixtures {
  tnEnv: TestnetEnv;
  bnbClient: BnbClient;
  solClient: SolClient;
}

// ── Extended test fixture ─────────────────────────────────────────────────────

export const test = base.extend<TestnetFixtures>({
  /**
   * Load and validate all testnet env vars once per test worker.
   * Throws with a clear message if any required secret is absent.
   */
  tnEnv: async ({}, use) => {
    const env = loadTestnetEnv();
    await use(env);
  },

  /** Ethers provider + deployer wallet for BNB Chapel. */
  bnbClient: async ({ tnEnv }, use) => {
    const client = makeBnbClient({
      rpcUrl: tnEnv.bnbRpc,
      privateKey: tnEnv.deployerPrivKeyBnb,
    });
    await use(client);
  },

  /** Solana Connection + deployer Keypair for Devnet. */
  solClient: async ({ tnEnv }, use) => {
    const connection = makeSolConnection(tnEnv.solRpc);
    const deployer = solKeypairFromBase64(tnEnv.deployerKeypairSolBase64);
    await use({ connection, deployer });
  },

  /**
   * Override base `page` fixture to auto-seed admin auth on every test.
   * Tests that need a specific role (e.g. treasurer) can call seedRealAuth()
   * again inside the test body with a different staff identity.
   */
  page: async ({ page, tnEnv }, use) => {
    await seedRealAuth(page, tnEnv.adminApiUrl, DEV_ADMIN);
    await use(page);
  },
});
