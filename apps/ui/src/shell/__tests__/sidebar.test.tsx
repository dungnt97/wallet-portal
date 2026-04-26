// Tests for shell/sidebar.tsx — Sidebar nav with badges and user footer.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../sidebar';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({
    staff: { name: 'Alice Admin', initials: 'AA', role: 'admin' },
  }),
}));

vi.mock('../use-sidebar-counts', () => ({
  useSidebarCounts: () => ({
    deposits: 3,
    sweep: 0,
    withdrawals: 5,
    multisig: null,
    recovery: null,
  }),
}));

vi.mock('@/icons', () => ({
  I: new Proxy(
    {},
    {
      get:
        (_t, key) =>
        ({ className }: { className?: string }) => (
          <span data-testid={`icon-${String(key)}`} className={className} />
        ),
    }
  ),
}));

vi.mock('@/lib/constants', () => ({
  ROLES: {
    admin: { id: 'admin', label: 'Admin', accent: 'red' },
    treasurer: { id: 'treasurer', label: 'Treasurer', accent: 'green' },
    operator: { id: 'operator', label: 'Operator', accent: 'blue' },
    viewer: { id: 'viewer', label: 'Viewer', accent: 'gray' },
  },
}));

// ── Helper ────────────────────────────────────────────────────────────────────

function renderSidebar(props: { collapsed?: boolean; onNavigate?: () => void } = {}) {
  return render(
    <MemoryRouter initialEntries={['/app/dashboard']}>
      <Sidebar collapsed={props.collapsed ?? false} onNavigate={props.onNavigate} />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sidebar', () => {
  it('renders aside element', () => {
    renderSidebar();
    expect(document.querySelector('aside.sidebar')).toBeInTheDocument();
  });

  it('sets data-collapsed=false when not collapsed', () => {
    renderSidebar({ collapsed: false });
    expect(document.querySelector('aside')).toHaveAttribute('data-collapsed', 'false');
  });

  it('sets data-collapsed=true when collapsed', () => {
    renderSidebar({ collapsed: true });
    expect(document.querySelector('aside')).toHaveAttribute('data-collapsed', 'true');
  });

  it('renders brand mark', () => {
    renderSidebar();
    expect(document.querySelector('.brand-mark')).toBeInTheDocument();
  });

  it('renders sidebar nav links', () => {
    renderSidebar();
    // NavLinks render as anchor elements
    const links = document.querySelectorAll('a.nav-item');
    expect(links.length).toBeGreaterThan(0);
  });

  it('shows deposits badge count when > 0', () => {
    renderSidebar();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows withdrawals badge count when > 0', () => {
    renderSidebar();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('does not show sweep badge when count is 0', () => {
    renderSidebar();
    // 0-count badges are suppressed in sidebar logic
    const badges = document.querySelectorAll('.nav-badge');
    const badgeTexts = Array.from(badges).map((b) => b.textContent);
    expect(badgeTexts).not.toContain('0');
  });

  it('renders staff name in footer', () => {
    renderSidebar();
    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
  });

  it('renders staff initials avatar', () => {
    renderSidebar();
    expect(screen.getByText('AA')).toBeInTheDocument();
  });

  it('renders staff role pill', () => {
    renderSidebar();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('calls onNavigate when a nav link is clicked', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderSidebar({ onNavigate });
    const links = document.querySelectorAll('a.nav-item');
    await user.click(links[0] as HTMLElement);
    expect(onNavigate).toHaveBeenCalled();
  });

  it('renders section labels from nav structure', () => {
    renderSidebar();
    // Section labels render as i18n keys
    expect(screen.getByText('sidebar.overview')).toBeInTheDocument();
  });
});
