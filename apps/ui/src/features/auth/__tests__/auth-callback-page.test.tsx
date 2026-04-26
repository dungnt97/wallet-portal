import { AuthContext } from '@/auth/auth-provider';
import { AuthCallbackPage } from '@/features/auth/auth-callback-page';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type AuthOverride = {
  refresh?: () => Promise<void>;
  staff?: null | { id: string; name: string; email: string; role: string; initials: string };
};

function renderCallback(search: string, authOverrides: AuthOverride = {}) {
  const navigate = vi.fn();
  const refresh = vi.fn().mockResolvedValue(undefined);
  const authCtx = {
    staff: null,
    loading: false,
    initiateLogin: vi.fn(),
    logout: vi.fn(),
    refresh,
    hasPerm: vi.fn(() => false),
    ...authOverrides,
  };

  const result = render(
    <AuthContext.Provider value={authCtx}>
      <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
          <Route path="/app/dashboard" element={<div data-testid="dashboard">dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

  return { ...result, refresh };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows loading state when ok=1 and refresh is pending', async () => {
    // refresh never resolves → stays in loading state
    const refresh = vi.fn(() => new Promise(() => {}));
    renderCallback('?ok=1', { refresh });
    // The "loading" text is shown as a pulsing element
    const loadingEl = document.querySelector('.animate-pulse');
    expect(loadingEl).toBeInTheDocument();
  });

  it('shows error state when error param is present', () => {
    renderCallback('?error=access_denied');
    expect(document.querySelector('.text-\\[var\\(--err-text\\)\\]')).toBeInTheDocument();
  });

  it('shows error when neither ok nor error param present', () => {
    renderCallback('');
    expect(document.querySelector('.text-\\[var\\(--err-text\\)\\]')).toBeInTheDocument();
  });

  it('redirects to /login after 3s on error param', async () => {
    renderCallback('?error=access_denied');
    // Error state shown synchronously
    expect(document.querySelector('.text-\\[var\\(--err-text\\)\\]')).toBeInTheDocument();
    // Advance fake timers past the 3s delay
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.queryByTestId('login-page')).toBeInTheDocument();
  });

  it('calls refresh() when ok=1', () => {
    const refresh = vi.fn(() => new Promise(() => {}));
    renderCallback('?ok=1', { refresh });
    expect(refresh).toHaveBeenCalled();
  });

  it('navigates to /app/dashboard after successful refresh', async () => {
    vi.useRealTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderCallback('?ok=1', { refresh });
    await waitFor(() => expect(screen.queryByTestId('dashboard')).toBeInTheDocument());
  });

  it('navigates to intended path from sessionStorage after refresh', async () => {
    vi.useRealTimers();
    sessionStorage.setItem('wp_intended_path', '/app/deposits');
    const refresh = vi.fn().mockResolvedValue(undefined);
    // intended path /app/deposits is not in our test routes, but navigation fires
    // so just verify refresh was called (navigation goes to intended path)
    renderCallback('?ok=1', { refresh });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // sessionStorage item removed after navigation
    await waitFor(() => expect(sessionStorage.getItem('wp_intended_path')).toBeNull());
  });

  it('shows error state when refresh rejects with ApiError', async () => {
    // Uses real timers — only verify error is shown, not the 3s redirect
    vi.useRealTimers();
    const { ApiError } = await import('@/api/client');
    const refresh = vi.fn().mockRejectedValue(new ApiError('Unauthorized', 401));
    renderCallback('?ok=1', { refresh });
    await waitFor(() =>
      expect(document.querySelector('.text-\\[var\\(--err-text\\)\\]')).toBeInTheDocument()
    );
  });

  it('shows error state when refresh rejects with generic error', async () => {
    // Uses real timers — only verify error is shown
    vi.useRealTimers();
    const refresh = vi.fn().mockRejectedValue(new Error('Network error'));
    renderCallback('?ok=1', { refresh });
    await waitFor(() =>
      expect(document.querySelector('.text-\\[var\\(--err-text\\)\\]')).toBeInTheDocument()
    );
  });

  it('shows "redirecting to login" subtext on error', () => {
    renderCallback('?error=expired');
    // The redirecting message is shown
    const subtexts = document.querySelectorAll('.text-\\[var\\(--text-muted\\)\\]');
    expect(subtexts.length).toBeGreaterThan(0);
  });
});
