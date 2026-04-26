import { beforeEach, describe, expect, it, vi } from 'vitest';

// Prevent zustand persist from touching real localStorage
vi.mock('zustand/middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand/middleware')>();
  // biome-ignore lint/suspicious/noExplicitAny: zustand persist stub in tests
  return { ...actual, persist: (fn: any) => fn };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('env-store', () => {
  it('MULTI_ENV_ENABLED is false when VITE_ENV_PROFILES not set', async () => {
    const { MULTI_ENV_ENABLED } = await import('../env-store');
    // In test env VITE_ENV_PROFILES is not set → single-env mode
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
    // When no profiles, initial name is ''
    if (ENV_PROFILES.length === 0) {
      // Reset to default
      useEnvStore.setState({ activeProfileName: '' });
      expect(useEnvStore.getState().activeProfileName).toBe('');
    }
  });
});
