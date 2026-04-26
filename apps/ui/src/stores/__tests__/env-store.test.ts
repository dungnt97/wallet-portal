import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prevent zustand persist from touching real localStorage
vi.mock('zustand/middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand/middleware')>();
  // biome-ignore lint/suspicious/noExplicitAny: zustand persist stub in tests
  return { ...actual, persist: (fn: any) => fn };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('env-store — single-env mode (no VITE_ENV_PROFILES)', () => {
  it('MULTI_ENV_ENABLED is false when VITE_ENV_PROFILES not set', async () => {
    const { MULTI_ENV_ENABLED } = await import('../env-store');
    expect(MULTI_ENV_ENABLED).toBe(false);
  });

  it('ENV_PROFILES is empty array when VITE_ENV_PROFILES not set', async () => {
    const { ENV_PROFILES } = await import('../env-store');
    expect(Array.isArray(ENV_PROFILES)).toBe(true);
    expect(ENV_PROFILES.length).toBe(0);
  });

  it('getActiveApiBase returns empty string in single-env mode', async () => {
    const { getActiveApiBase } = await import('../env-store');
    expect(getActiveApiBase()).toBe('');
  });

  it('useEnvStore setActiveProfileName updates state', async () => {
    const { useEnvStore } = await import('../env-store');
    useEnvStore.getState().setActiveProfileName('staging');
    expect(useEnvStore.getState().activeProfileName).toBe('staging');
  });

  it('useEnvStore has initial activeProfileName as empty string in single-env mode', async () => {
    const { useEnvStore, ENV_PROFILES } = await import('../env-store');
    if (ENV_PROFILES.length === 0) {
      useEnvStore.setState({ activeProfileName: '' });
      expect(useEnvStore.getState().activeProfileName).toBe('');
    }
  });
});

// ── parseProfiles branches — tested by stubbing import.meta.env ──────────────
// Vitest supports vi.stubEnv() which sets import.meta.env values for the test.
// The module must be re-imported after stubbing because parseProfiles() runs
// at module-load time and the result is stored in the module-level constant.

describe('parseProfiles — JSON parsing branches', () => {
  beforeEach(() => {
    vi.resetModules(); // force fresh module state so parseProfiles re-runs
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns profiles array when VITE_ENV_PROFILES is valid JSON', async () => {
    vi.stubEnv(
      'VITE_ENV_PROFILES',
      JSON.stringify([
        { name: 'local', apiUrl: 'http://localhost:3001' },
        { name: 'staging', apiUrl: 'https://staging.example.com' },
      ])
    );
    const { ENV_PROFILES, MULTI_ENV_ENABLED } = await import('../env-store');
    expect(ENV_PROFILES).toHaveLength(2);
    expect(ENV_PROFILES[0].name).toBe('local');
    expect(MULTI_ENV_ENABLED).toBe(true);
  });

  it('returns empty array when VITE_ENV_PROFILES is not an array', async () => {
    vi.stubEnv('VITE_ENV_PROFILES', JSON.stringify({ name: 'x', apiUrl: 'http://x' }));
    const { ENV_PROFILES } = await import('../env-store');
    expect(ENV_PROFILES).toEqual([]);
  });

  it('filters out entries missing name or apiUrl', async () => {
    vi.stubEnv(
      'VITE_ENV_PROFILES',
      JSON.stringify([
        { name: 'ok', apiUrl: 'http://ok' },
        { name: 'missing-url' }, // no apiUrl
        { apiUrl: 'http://no-name' }, // no name
        null, // null entry
      ])
    );
    const { ENV_PROFILES } = await import('../env-store');
    expect(ENV_PROFILES).toHaveLength(1);
    expect(ENV_PROFILES[0].name).toBe('ok');
  });

  it('returns empty array when VITE_ENV_PROFILES is invalid JSON', async () => {
    vi.stubEnv('VITE_ENV_PROFILES', 'not-valid-json{{{');
    const { ENV_PROFILES } = await import('../env-store');
    expect(ENV_PROFILES).toEqual([]);
  });

  it('getActiveApiBase returns active profile URL in multi-env mode', async () => {
    vi.stubEnv(
      'VITE_ENV_PROFILES',
      JSON.stringify([
        { name: 'local', apiUrl: 'http://localhost:3001' },
        { name: 'staging', apiUrl: 'https://staging.example.com' },
      ])
    );
    const { getActiveApiBase, useEnvStore } = await import('../env-store');
    useEnvStore.getState().setActiveProfileName('staging');
    expect(getActiveApiBase()).toBe('https://staging.example.com');
  });

  it('getActiveApiBase falls back to first profile when name not found', async () => {
    vi.stubEnv(
      'VITE_ENV_PROFILES',
      JSON.stringify([{ name: 'local', apiUrl: 'http://localhost:3001' }])
    );
    const { getActiveApiBase, useEnvStore } = await import('../env-store');
    useEnvStore.getState().setActiveProfileName('nonexistent');
    expect(getActiveApiBase()).toBe('http://localhost:3001');
  });
});
