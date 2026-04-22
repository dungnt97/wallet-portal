// Unit tests for env config validation
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config/env.js';

const VALID_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  RPC_BNB_PRIMARY: 'https://data-seed-prebsc-1-s1.binance.org:8545',
  RPC_SOLANA_PRIMARY: 'https://api.devnet.solana.com',
  SVC_BEARER_TOKEN: 'supersecrettoken1234567890ab',
  HD_MASTER_XPUB_BNB: 'test test test test test test test test test test test junk',
  HD_MASTER_SEED_SOLANA: 'deadbeefdeadbeefdeadbeef',
};

describe('loadConfig', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    // Clear wallet-engine vars to avoid interference
    for (const key of Object.keys(VALID_ENV)) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(VALID_ENV)) {
      delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('succeeds with all required vars set', () => {
    Object.assign(process.env, VALID_ENV);
    // NODE_ENV may be 'test' in vitest — schema accepts it
    const cfg = loadConfig();
    expect(cfg.PORT).toBe(3002);
    expect(['development', 'test', 'production']).toContain(cfg.NODE_ENV);
    expect(cfg.ADMIN_API_BASE_URL).toBe('http://localhost:3001');
  });

  it('applies PORT default of 3002', () => {
    Object.assign(process.env, VALID_ENV);
    delete process.env['PORT']; // must use delete — =undefined coerces to string 'undefined'
    const cfg = loadConfig();
    expect(cfg.PORT).toBe(3002);
  });

  it('throws when DATABASE_URL missing', () => {
    Object.assign(process.env, VALID_ENV);
    delete process.env['DATABASE_URL']; // must use delete — =undefined coerces to string 'undefined'
    expect(() => loadConfig()).toThrow('Invalid environment configuration');
  });

  it('throws when SVC_BEARER_TOKEN too short', () => {
    Object.assign(process.env, VALID_ENV);
    process.env.SVC_BEARER_TOKEN = 'short';
    expect(() => loadConfig()).toThrow('Invalid environment configuration');
  });

  it('throws when RPC_BNB_PRIMARY is not a URL', () => {
    Object.assign(process.env, VALID_ENV);
    process.env.RPC_BNB_PRIMARY = 'not-a-url';
    expect(() => loadConfig()).toThrow('Invalid environment configuration');
  });

  it('accepts optional RPC_BNB_FALLBACK', () => {
    Object.assign(process.env, VALID_ENV);
    process.env.RPC_BNB_FALLBACK = 'https://bsc-dataseed.binance.org/';
    const cfg = loadConfig();
    expect(cfg.RPC_BNB_FALLBACK).toBe('https://bsc-dataseed.binance.org/');
  });
});
