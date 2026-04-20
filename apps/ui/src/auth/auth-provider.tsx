// Auth context — fetches /auth/me on mount, exposes staff + OIDC login + logout
// P06: initiateLogin() starts Google OIDC flow (redirects away); no more fixture auth.
import React, { createContext, useCallback, useEffect, useState } from 'react';
import type { RoleId } from '@/lib/constants';
import { api, ApiError } from '@/api/client';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  /** Computed from name — first letters of first + last word, uppercase */
  initials: string;
}

interface AuthContextValue {
  staff: StaffUser | null;
  loading: boolean;
  /** Initiates Google OIDC flow — redirects the browser to Google consent page */
  initiateLogin: () => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Compute initials from a display name: "Alice Chen" → "AC" */
function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

type ApiStaff = Omit<StaffUser, 'initials'>;

function hydrateStaff(data: ApiStaff): StaffUser {
  return { ...data, initials: computeInitials(data.name) };
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface Props {
  children: React.ReactNode;
}

export function AuthProvider({ children }: Props) {
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: attempt to restore session from /auth/me via session cookie
  useEffect(() => {
    api
      .get<ApiStaff>('/auth/me')
      .then((data) => setStaff(hydrateStaff(data)))
      .catch((err) => {
        // 401 is expected when not logged in — leave staff null
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error('[AuthProvider] Unexpected error fetching /auth/me', err);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  /**
   * Initiate Google OIDC login — calls /auth/session/initiate, redirects to Google.
   * Browser lands on /auth/callback after consent (handled by AuthCallbackPage).
   */
  const initiateLogin = useCallback(async () => {
    const { url } = await api.post<{ url: string }>('/auth/session/initiate');
    window.location.href = url;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/session/logout');
    } catch {
      // best-effort — clear local state regardless
    }
    setStaff(null);
  }, []);

  // Internal escape hatch used by AuthCallbackPage to hydrate staff after redirect
  const refreshAuth = useCallback(async () => {
    try {
      const data = await api.get<ApiStaff>('/auth/me');
      setStaff(hydrateStaff(data));
    } catch {
      setStaff(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        staff,
        loading,
        initiateLogin,
        logout,
        // @ts-expect-error — refreshAuth is internal, not part of public AuthContextValue
        _refreshAuth: refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
