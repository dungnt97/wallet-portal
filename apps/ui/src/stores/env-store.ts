// Env-picker Zustand store — persists selected API profile in localStorage.
// The API client reads `getActiveApiBase()` on every request (dynamic getter,
// not captured at boot) so switching environments takes effect immediately.
//
// Profile list comes from VITE_ENV_PROFILES (JSON array) at build/dev time.
// If unset, a single fallback profile using the Vite proxy is used (picker hidden).
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface EnvProfile {
  name: string;
  apiUrl: string;
}

/** Parse VITE_ENV_PROFILES or return empty array (hide picker). */
function parseProfiles(): EnvProfile[] {
  const raw = import.meta.env.VITE_ENV_PROFILES as string | undefined;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(
      (p): p is EnvProfile =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as Record<string, unknown>).name === 'string' &&
        typeof (p as Record<string, unknown>).apiUrl === 'string'
    );
  } catch {
    console.warn('[env-store] Failed to parse VITE_ENV_PROFILES — using single-env mode');
    return [];
  }
}

export const ENV_PROFILES: EnvProfile[] = parseProfiles();

/** True when multi-profile mode is active (picker is shown). */
export const MULTI_ENV_ENABLED = ENV_PROFILES.length > 0;

interface EnvState {
  /** Name of the currently selected profile (matches EnvProfile.name). */
  activeProfileName: string;
  setActiveProfileName: (name: string) => void;
}

export const useEnvStore = create<EnvState>()(
  persist(
    (set) => ({
      activeProfileName: ENV_PROFILES[0]?.name ?? '',
      setActiveProfileName: (name) => set({ activeProfileName: name }),
    }),
    { name: 'wp_env_profile' }
  )
);

/**
 * Returns the base URL for the currently active environment profile.
 * Called on every API request — intentionally not memoised at boot.
 * Falls back to '' (relative URL — Vite proxy) when single-env mode.
 */
export function getActiveApiBase(): string {
  if (!MULTI_ENV_ENABLED) return '';
  const name = useEnvStore.getState().activeProfileName;
  const profile = ENV_PROFILES.find((p) => p.name === name) ?? ENV_PROFILES[0];
  return profile?.apiUrl ?? '';
}
