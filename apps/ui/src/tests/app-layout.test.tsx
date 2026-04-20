// Smoke test — renders AppLayout with required providers, asserts sidebar + topbar present
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/shell/app-layout';
import { AuthContext } from '@/auth/auth-provider';
import type { StaffUser } from '@/auth/auth-provider';
import '@/i18n';

// Minimal stub staff for auth context
const STUB_STAFF: StaffUser = {
  id: 'stf_test',
  name: 'Test User',
  email: 'test@treasury.io',
  role: 'admin',
  initials: 'TU',
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ staff: STUB_STAFF, loading: false, login: vi.fn(), logout: vi.fn() }}>
        <MemoryRouter initialEntries={['/app/dashboard']}>
          <Routes>
            <Route path="/app/*" element={ui}>
              <Route path="dashboard" element={<div data-testid="page-content">Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('AppLayout', () => {
  it('renders sidebar and topbar', () => {
    renderWithProviders(<AppLayout />);
    // Sidebar brand mark
    expect(screen.getByText('W')).toBeDefined();
    // Sidebar nav — Dashboard link
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    // Topbar — sidebar toggle button
    expect(screen.getByLabelText('Toggle sidebar')).toBeDefined();
  });

  it('renders page content via Outlet', () => {
    renderWithProviders(<AppLayout />);
    expect(screen.getByTestId('page-content')).toBeDefined();
  });
});
