// Auth context — fetches /auth/me on mount, exposes staff + role + login/logout
import React, { createContext, useCallback, useEffect, useState } from 'react';
import { FIXTURE_STAFF, type RoleId } from '@/lib/constants';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  initials: string;
}

interface AuthContextValue {
  staff: StaffUser | null;
  loading: boolean;
  login: (email: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface Props {
  children: React.ReactNode;
}

export function AuthProvider({ children }: Props) {
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: attempt to restore session from /auth/me.
  // Falls back to fixture staff stored in sessionStorage for local dev
  // (real OIDC wired in P06).
  useEffect(() => {
    const stored = sessionStorage.getItem('wp_fixture_staff');
    if (stored) {
      try {
        setStaff(JSON.parse(stored) as StaffUser);
      } catch {
        sessionStorage.removeItem('wp_fixture_staff');
      }
      setLoading(false);
      return;
    }

    // Try real session cookie
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('unauthenticated');
        return r.json() as Promise<StaffUser>;
      })
      .then((data) => setStaff(data))
      .catch(() => {
        // 401 or network — leave staff null, router will redirect to /login
      })
      .finally(() => setLoading(false));
  }, []);

  // Fixture login used until P06 replaces with OIDC.
  // Looks up staff by email from the fixture list, stores in sessionStorage.
  const login = useCallback(async (email: string) => {
    const match = FIXTURE_STAFF.find(
      (s) => s.email.toLowerCase() === email.trim().toLowerCase() && s.active,
    );
    if (!match) throw new Error('No active staff account found for that email.');
    sessionStorage.setItem('wp_fixture_staff', JSON.stringify(match));
    setStaff(match);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('wp_fixture_staff');
    setStaff(null);
    // Best-effort cookie clear
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ staff, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
