// Additional coverage for config/env.ts uncovered lines:
// - Lines 6-9: urlList transform (comma-separated → array)
// - Lines 86-87: bnbRpcUrls with optional RPC_BNB_FALLBACK set
// - Lines 91-92: solanaRpcUrls with optional RPC_SOLANA_FALLBACK set
// The existing env-validation.test.ts covers loadConfig happy/error paths.
import { afterEach, describe, expect, it } from 'vitest';

// ── Tests: bnbRpcUrls / solanaRpcUrls with fallback ───────────────────────────

describe('env.ts — bnbRpcUrls with fallback', () => {
  afterEach(() => {
    delete process.env.RPC_BNB_FALLBACK;
    delete process.env.RPC_SOLANA_FALLBACK;
  });

  it('bnbRpcUrls returns [primary, fallback] when both set', async () => {
    const { bnbRpcUrls } = await import('../config/env.js');
    const cfg = {
      RPC_BNB_PRIMARY: 'https://bnb-primary.rpc',
      RPC_BNB_FALLBACK: 'https://bnb-fallback.rpc',
    } as Parameters<typeof bnbRpcUrls>[0];

    const urls = bnbRpcUrls(cfg);
    expect(urls).toEqual(['https://bnb-primary.rpc', 'https://bnb-fallback.rpc']);
  });

  it('bnbRpcUrls returns [primary] only when fallback is undefined', async () => {
    const { bnbRpcUrls } = await import('../config/env.js');
    const cfg = {
      RPC_BNB_PRIMARY: 'https://bnb-primary.rpc',
      RPC_BNB_FALLBACK: undefined,
    } as Parameters<typeof bnbRpcUrls>[0];

    const urls = bnbRpcUrls(cfg);
    expect(urls).toEqual(['https://bnb-primary.rpc']);
  });

  it('solanaRpcUrls returns [primary, fallback] when both set', async () => {
    const { solanaRpcUrls } = await import('../config/env.js');
    const cfg = {
      RPC_SOLANA_PRIMARY: 'https://sol-primary.rpc',
      RPC_SOLANA_FALLBACK: 'https://sol-fallback.rpc',
    } as Parameters<typeof solanaRpcUrls>[0];

    const urls = solanaRpcUrls(cfg);
    expect(urls).toEqual(['https://sol-primary.rpc', 'https://sol-fallback.rpc']);
  });

  it('solanaRpcUrls returns [primary] only when fallback is undefined', async () => {
    const { solanaRpcUrls } = await import('../config/env.js');
    const cfg = {
      RPC_SOLANA_PRIMARY: 'https://sol-primary.rpc',
      RPC_SOLANA_FALLBACK: undefined,
    } as Parameters<typeof solanaRpcUrls>[0];

    const urls = solanaRpcUrls(cfg);
    expect(urls).toEqual(['https://sol-primary.rpc']);
  });
});

// ── Tests: loadConfig — WATCHER_ENABLED string transform ─────────────────────

describe('env.ts — loadConfig WATCHER_ENABLED transform', () => {
  const BASE_ENV = {
    DATABASE_URL: 'postgres://localhost/test',
    RPC_BNB_PRIMARY: 'https://fake-bnb',
    RPC_SOLANA_PRIMARY: 'https://fake-sol',
    SVC_BEARER_TOKEN: 'svc-token-test-at-least-16chars',
    HD_MASTER_XPUB_BNB: 'word '.repeat(12).trim(),
    HD_MASTER_SEED_SOLANA: 'deadbeef'.repeat(8),
  };

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(BASE_ENV)) {
      delete process.env[key];
    }
    delete process.env.WATCHER_ENABLED;
    delete process.env.RPC_BNB_FALLBACK;
    delete process.env.RPC_SOLANA_FALLBACK;
  });

  it('WATCHER_ENABLED=false → parsed as false boolean', async () => {
    Object.assign(process.env, BASE_ENV);
    process.env.WATCHER_ENABLED = 'false';

    const { loadConfig } = await import('../config/env.js');
    const cfg = loadConfig();
    expect(cfg.WATCHER_ENABLED).toBe(false);
  });

  it('WATCHER_ENABLED=true → parsed as true boolean', async () => {
    Object.assign(process.env, BASE_ENV);
    process.env.WATCHER_ENABLED = 'true';

    const { loadConfig } = await import('../config/env.js');
    const cfg = loadConfig();
    expect(cfg.WATCHER_ENABLED).toBe(true);
  });

  it('WATCHER_ENABLED unset → defaults to true', async () => {
    Object.assign(process.env, BASE_ENV);
    delete process.env.WATCHER_ENABLED;

    const { loadConfig } = await import('../config/env.js');
    const cfg = loadConfig();
    expect(cfg.WATCHER_ENABLED).toBe(true);
  });
});
