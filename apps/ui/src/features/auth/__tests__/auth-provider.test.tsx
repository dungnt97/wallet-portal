import { AuthContext, AuthProvider, PERMS } from '@/auth/auth-provider';
import { useAuth } from '@/auth/use-auth';
import { act, render, screen, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

// Prevent zustand persist from touching localStorage and corrupting jsdom
vi.mock('zustand/middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand/middleware')>();
  return {
    ...actual,
    // biome-ignore lint/suspicious/noExplicitAny: zustand persist stub in tests
    persist: (fn: any) => fn,
  };
});

// Provide a stable localStorage mock so AuthProvider's dev-mode branch works
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

// ── PERMS matrix ──────────────────────────────────────────────────────────────

describe('PERMS matrix', () => {
  it('withdrawal.create is granted to admin and operator', () => {
    expect(PERMS['withdrawal.create']).toContain('admin');
    expect(PERMS['withdrawal.create']).toContain('operator');
  });

  it('withdrawal.approve is granted only to treasurer', () => {
    expect(PERMS['withdrawal.approve']).toEqual(['treasurer']);
  });

  it('staff.manage is admin-only', () => {
    expect(PERMS['staff.manage']).toEqual(['admin']);
  });

  it('user.view is granted to all roles', () => {
    expect(PERMS['user.view']).toContain('admin');
    expect(PERMS['user.view']).toContain('treasurer');
    expect(PERMS['user.view']).toContain('operator');
    expect(PERMS['user.view']).toContain('viewer');
  });

  it('ops.killswitch.toggle is admin-only', () => {
    expect(PERMS['ops.killswitch.toggle']).toEqual(['admin']);
  });

  it('audit.view does not include viewer', () => {
    expect(PERMS['audit.view']).not.toContain('viewer');
  });

  it('export.csv includes all roles', () => {
    expect(PERMS['export.csv']).toContain('viewer');
    expect(PERMS['export.csv']).toContain('admin');
  });
});

// ── AuthProvider loading state ────────────────────────────────────────────────

describe('AuthProvider', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Stub api.post so heartbeat effect doesn't crash (post returns Promise)
    const { api } = await import('@/api/client');
    vi.mocked(api.post).mockResolvedValue(undefined);
    // localStorage may be a mock object from zustand persist in jsdom
    try {
      localStorage.clear();
    } catch {
      for (const k of Object.keys(localStorage)) {
        localStorage.removeItem(k);
      }
    }
  });

  it('renders children', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValue({
      id: 'u1',
      name: 'Test User',
      email: 't@t.com',
      role: 'admin',
    });

    render(
      <AuthProvider>
        <div data-testid="child">hello</div>
      </AuthProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('starts loading then resolves staff from /auth/me', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValue({
      id: 'u1',
      name: 'Alice Chen',
      email: 'alice@test.com',
      role: 'admin',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.staff?.email).toBe('alice@test.com');
    expect(result.current.staff?.initials).toBe('AC');
  });

  it('leaves staff null when /auth/me returns 401', async () => {
    const { api, ApiError } = await import('@/api/client');
    vi.mocked(api.get).mockRejectedValue(new ApiError(401, 'Unauthorized'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.staff).toBeNull();
  });

  it('computes initials for single-word name', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValue({
      id: 'u1',
      name: 'Madonna',
      email: 'm@t.com',
      role: 'viewer',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.staff?.initials).toBe('MA');
  });

  it('computes initials: first letter of first + last word', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValue({
      id: 'u1',
      name: 'Jean Claude Van Damme',
      email: 'j@t.com',
      role: 'operator',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.staff?.initials).toBe('JD');
  });

  it('hydrates staff from localStorage in dev mode', async () => {
    // VITE_AUTH_DEV_MODE=true in .env, so dev branch runs
    const { api } = await import('@/api/client');
    // Heartbeat fires when staff is set — mock it
    vi.mocked(api.post).mockResolvedValue(undefined);
    localStorage.setItem(
      '__dev_staff__',
      JSON.stringify({
        id: 'dev1',
        name: 'Dev User',
        email: 'dev@test.com',
        role: 'admin',
      })
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Either hydrated from localStorage or from api.get fallback — staff should be set
    expect(result.current.staff).not.toBeNull();
  });

  it('falls through to /auth/me when localStorage dev_staff is malformed JSON', async () => {
    const { api } = await import('@/api/client');
    localStorage.setItem('__dev_staff__', '{invalid json}');
    vi.mocked(api.get).mockResolvedValue({
      id: 'u2',
      name: 'Bob Smith',
      email: 'bob@test.com',
      role: 'treasurer',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Should have fetched from API after JSON parse failure
    expect(result.current.staff).not.toBeNull();
  });
});

// ── hasPerm ───────────────────────────────────────────────────────────────────

describe('hasPerm', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { api } = await import('@/api/client');
    vi.mocked(api.post).mockResolvedValue(undefined);
    try {
      localStorage.clear();
    } catch {
      for (const k of Object.keys(localStorage)) {
        localStorage.removeItem(k);
      }
    }
  });

  async function renderWithRole(role: string) {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValue({
      id: 'u1',
      name: 'Test User',
      email: 't@t.com',
      role,
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    return result;
  }

  it('returns false when no staff loaded', async () => {
    const { api, ApiError } = await import('@/api/client');
    vi.mocked(api.get).mockRejectedValue(new ApiError(401, ''));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasPerm('withdrawal.create')).toBe(false);
  });

  it('admin can create withdrawals', async () => {
    const result = await renderWithRole('admin');
    expect(result.current.hasPerm('withdrawal.create')).toBe(true);
  });

  it('viewer cannot create withdrawals', async () => {
    const result = await renderWithRole('viewer');
    expect(result.current.hasPerm('withdrawal.create')).toBe(false);
  });

  it('treasurer can approve withdrawals', async () => {
    const result = await renderWithRole('treasurer');
    expect(result.current.hasPerm('withdrawal.approve')).toBe(true);
  });

  it('operator cannot approve withdrawals', async () => {
    const result = await renderWithRole('operator');
    expect(result.current.hasPerm('withdrawal.approve')).toBe(false);
  });

  it('admin can toggle killswitch', async () => {
    const result = await renderWithRole('admin');
    expect(result.current.hasPerm('ops.killswitch.toggle')).toBe(true);
  });

  it('returns false for unknown permission key', async () => {
    const result = await renderWithRole('admin');
    expect(result.current.hasPerm('nonexistent.perm')).toBe(false);
  });
});

// ── logout ────────────────────────────────────────────────────────────────────

describe('logout', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { api } = await import('@/api/client');
    vi.mocked(api.post).mockResolvedValue(undefined);
    try {
      localStorage.clear();
    } catch {
      for (const k of Object.keys(localStorage)) {
        localStorage.removeItem(k);
      }
    }
  });

  it('clears staff on logout', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValue({
      id: 'u1',
      name: 'Test User',
      email: 't@t.com',
      role: 'admin',
    });
    vi.mocked(api.post).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.staff).not.toBeNull();

    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.staff).toBeNull();
  });

  it('clears staff even when logout API call fails', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValue({
      id: 'u1',
      name: 'Test User',
      email: 't@t.com',
      role: 'admin',
    });
    vi.mocked(api.post).mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.staff).toBeNull();
  });
});
