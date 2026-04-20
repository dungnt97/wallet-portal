import { ApiError, api } from '@/api/client';
import type { RoleId } from '@/lib/constants';
// Auth context — fetches /auth/me on mount, exposes staff + OIDC login + logout
// P06: initiateLogin() starts Google OIDC flow (redirects away); no more fixture auth.
// Pass 4: adds hasPerm(permission) from prototype RBAC matrix.
import type React from 'react';
import { createContext, useCallback, useEffect, useState } from 'react';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  /** Computed from name — first letters of first + last word, uppercase */
  initials: string;
}

// ── Permission matrix (ported from prototype auth.jsx) ───────────────────────
// Role → list of permissions. hasPerm(k) walks this map.
export const PERMS: Record<string, RoleId[]> = {
  'withdrawal.create': ['admin', 'operator'],
  'withdrawal.cancel': ['admin', 'operator'],
  'withdrawal.approve': ['treasurer'],
  'withdrawal.reject': ['treasurer', 'admin'],
  'withdrawal.execute': ['admin', 'operator'],
  'sweep.create': ['admin', 'operator'],
  'sweep.execute': ['admin', 'operator'],
  'sweep.trigger': ['admin', 'operator'],
  'multisig.approve': ['treasurer'],
  'multisig.reject': ['treasurer', 'admin'],
  'user.create': ['admin', 'operator'],
  'user.update': ['admin', 'operator'],
  'user.view': ['admin', 'operator', 'treasurer', 'viewer'],
  'staff.manage': ['admin'],
  'config.update': ['admin'],
  'deposit.view': ['admin', 'operator', 'treasurer', 'viewer'],
  'export.csv': ['admin', 'operator', 'treasurer', 'viewer'],
  'audit.view': ['admin', 'treasurer'],
  'architecture.view': ['admin', 'treasurer', 'operator', 'viewer'],
};

interface AuthContextValue {
  staff: StaffUser | null;
  loading: boolean;
  /** Initiates Google OIDC flow — redirects the browser to Google consent page */
  initiateLogin: () => Promise<void>;
  logout: () => Promise<void>;
  /** RBAC check — returns true if the logged-in staff's role grants `perm`. */
  hasPerm: (perm: string) => boolean;
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

  const hasPerm = useCallback(
    (perm: string): boolean => {
      if (!staff) return false;
      const roles = PERMS[perm];
      if (!roles) return false;
      return roles.includes(staff.role);
    },
    [staff]
  );

  return (
    <AuthContext.Provider
      value={{
        staff,
        loading,
        initiateLogin,
        logout,
        hasPerm,
        // @ts-expect-error — refreshAuth is internal, not part of public AuthContextValue
        _refreshAuth: refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
