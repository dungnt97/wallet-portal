// Unit tests for config/env.ts — validates Zod env schema parsing
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config/env.js';

const VALID_ENV = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: 'a'.repeat(32),
  SVC_BEARER_TOKEN: 'b'.repeat(16),
  CORS_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'info',
  GOOGLE_WORKSPACE_DOMAIN: 'company.com',
};

describe('loadConfig', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    // Clear relevant keys then set valid env
    // process.env[k] must be deleted (not set to undefined — coerces to string "undefined")
    for (const k of Object.keys(VALID_ENV)) {
      delete process.env[k];
    }
    Object.assign(process.env, VALID_ENV);
  });

  afterEach(() => {
    // Restore original env (process.env[k] must be deleted, not set to undefined)
    for (const k of Object.keys(VALID_ENV)) {
      delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
  });

  it('parses valid env and returns typed config', () => {
    const cfg = loadConfig();
    expect(cfg.PORT).toBe(3001);
    expect(cfg.NODE_ENV).toBe('test');
    expect(cfg.DATABASE_URL).toBe('postgresql://localhost:5432/test');
    expect(cfg.SESSION_SECRET).toHaveLength(32);
    expect(cfg.SVC_BEARER_TOKEN).toHaveLength(16);
  });

  it('coerces PORT string to number', () => {
    process.env.PORT = '4000';
    const cfg = loadConfig();
    expect(cfg.PORT).toBe(4000);
    expect(typeof cfg.PORT).toBe('number');
  });

  it('applies defaults for optional vars', () => {
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (= undefined coerces to string "undefined")
    delete process.env.PORT;
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (= undefined coerces to string "undefined")
    delete process.env.REDIS_URL;
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (= undefined coerces to string "undefined")
    delete process.env.LOG_LEVEL;
    const cfg = loadConfig();
    expect(cfg.PORT).toBe(3001);
    expect(cfg.REDIS_URL).toBe('redis://localhost:6379');
    expect(cfg.LOG_LEVEL).toBe('info');
  });

  it('throws on missing DATABASE_URL', () => {
    // biome-ignore lint/performance/noDelete: process.env key must be deleted (= undefined coerces to string "undefined")
    delete process.env.DATABASE_URL;
    expect(() => loadConfig()).toThrow('Invalid environment configuration');
  });

  it('throws on SESSION_SECRET shorter than 32 chars', () => {
    process.env.SESSION_SECRET = 'tooshort';
    expect(() => loadConfig()).toThrow('Invalid environment configuration');
  });

  it('throws on invalid NODE_ENV value', () => {
    process.env.NODE_ENV = 'staging';
    expect(() => loadConfig()).toThrow('Invalid environment configuration');
  });
});
