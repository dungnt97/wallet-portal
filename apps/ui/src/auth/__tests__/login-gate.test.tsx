// Tests for auth/login-gate.tsx — redirects to /login when unauthenticated.
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockUseAuth = vi.fn();
vi.mock('../use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Import after mock
import { LoginGate } from '../login-gate';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStaff() {
  return { staffId: 'staff-1', email: 'admin@test.com', role: 'admin' };
}

function renderGate(initialEntry = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route element={<LoginGate />}>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('LoginGate', () => {
  it('shows loading indicator when auth is loading', () => {
    mockUseAuth.mockReturnValue({ staff: null, loading: true });
    renderGate();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('does not render outlet while loading', () => {
    mockUseAuth.mockReturnValue({ staff: null, loading: true });
    renderGate();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('redirects to /login when staff is null and not loading', () => {
    mockUseAuth.mockReturnValue({ staff: null, loading: false });
    renderGate('/dashboard');
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('does not render outlet when redirecting', () => {
    mockUseAuth.mockReturnValue({ staff: null, loading: false });
    renderGate('/dashboard');
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('renders outlet when staff is authenticated', () => {
    mockUseAuth.mockReturnValue({ staff: makeStaff(), loading: false });
    renderGate('/dashboard');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('does not redirect when staff is authenticated', () => {
    mockUseAuth.mockReturnValue({ staff: makeStaff(), loading: false });
    renderGate('/dashboard');
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });
});
