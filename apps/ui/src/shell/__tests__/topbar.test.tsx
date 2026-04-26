// Tests for shell/topbar.tsx — top navigation bar component.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/icons', () => ({
  I: new Proxy(
    {},
    {
      get:
        (_t, key) =>
        ({ size, className }: { size?: number; className?: string }) => (
          <span data-testid={`icon-${String(key)}`} className={className} data-size={size} />
        ),
    }
  ),
}));

const mockTheme = { current: 'light' as 'light' | 'dark' };
const mockToggleTheme = vi.fn();

vi.mock('@/stores/tweaks-store', () => ({
  useTweaksStore: (selector: (s: { theme: string; toggleTheme: () => void }) => unknown) =>
    selector({ theme: mockTheme.current, toggleTheme: mockToggleTheme }),
}));

vi.mock('react-router-dom', () => ({
  useMatch: () => ({ params: { page: 'dashboard' } }),
}));

vi.mock('@/features/notifs/use-notifications', () => ({
  useUnreadCount: () => ({ data: { count: 0 } }),
}));

vi.mock('@/components/overlays', () => ({
  NotificationsPanel: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="notif-panel">
        <button type="button" onClick={onClose}>
          close-notif
        </button>
      </div>
    ) : null,
}));

vi.mock('/Users/dungngo97/Documents/wallet-portal/apps/ui/src/shell/env-picker', () => ({
  EnvPicker: () => <div data-testid="env-picker" />,
}));

vi.mock('/Users/dungngo97/Documents/wallet-portal/apps/ui/src/shell/lang-switcher', () => ({
  LangSwitcher: () => <div data-testid="lang-switcher" />,
}));

vi.mock('/Users/dungngo97/Documents/wallet-portal/apps/ui/src/shell/nav-structure', () => ({
  pageTitleKey: (seg: string) => `nav.${seg}`,
}));

vi.mock('/Users/dungngo97/Documents/wallet-portal/apps/ui/src/shell/user-menu', () => ({
  UserMenu: ({ compact }: { compact: boolean }) => (
    <div data-testid={`user-menu-compact-${compact}`} />
  ),
}));

vi.mock('/Users/dungngo97/Documents/wallet-portal/apps/ui/src/shell/wallet-widget', () => ({
  WalletWidget: () => <div data-testid="wallet-widget" />,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { Topbar } from '../topbar';

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  viewport: 'lg' as const,
  onToggleSidebar: vi.fn(),
  onOpenCommandPalette: vi.fn(),
  onOpenTweaks: vi.fn(),
  onOpenAccount: vi.fn(),
  onOpenSecurity: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Topbar', () => {
  beforeEach(() => {
    mockTheme.current = 'light';
    mockToggleTheme.mockReset();
  });

  it('renders sidebar toggle button', () => {
    render(<Topbar {...defaultProps} />);
    expect(screen.getByTitle('Toggle sidebar')).toBeInTheDocument();
  });

  it('calls onToggleSidebar when sidebar toggle clicked', async () => {
    const onToggleSidebar = vi.fn();
    const user = userEvent.setup();
    render(<Topbar {...defaultProps} onToggleSidebar={onToggleSidebar} />);
    await user.click(screen.getByTitle('Toggle sidebar'));
    expect(onToggleSidebar).toHaveBeenCalled();
  });

  it('shows page title from pageTitleKey', () => {
    render(<Topbar {...defaultProps} />);
    // pageTitleKey('dashboard') => 'nav.dashboard', t('nav.dashboard') => 'nav.dashboard'
    expect(screen.getByText('nav.dashboard')).toBeInTheDocument();
  });

  it('shows breadcrumb Treasury label on large viewport', () => {
    render(<Topbar {...defaultProps} viewport="lg" />);
    expect(screen.getByText('Treasury')).toBeInTheDocument();
  });

  it('hides Treasury breadcrumb on xs viewport', () => {
    render(<Topbar {...defaultProps} viewport="xs" />);
    expect(screen.queryByText('Treasury')).not.toBeInTheDocument();
  });

  it('renders search button on non-xs viewport', () => {
    render(<Topbar {...defaultProps} viewport="lg" />);
    expect(screen.getByText('topbar.searchLong')).toBeInTheDocument();
  });

  it('renders icon-btn search on xs viewport', () => {
    render(<Topbar {...defaultProps} viewport="xs" />);
    // On xs, a search icon-btn is shown instead of the full search bar
    expect(screen.getByTitle(/common.search/)).toBeInTheDocument();
  });

  it('calls onOpenCommandPalette when search button clicked', async () => {
    const onOpenCommandPalette = vi.fn();
    const user = userEvent.setup();
    render(<Topbar {...defaultProps} onOpenCommandPalette={onOpenCommandPalette} />);
    await user.click(screen.getByText('topbar.searchLong').closest('button') as HTMLElement);
    expect(onOpenCommandPalette).toHaveBeenCalled();
  });

  it('renders wallet widget', () => {
    render(<Topbar {...defaultProps} />);
    expect(screen.getByTestId('wallet-widget')).toBeInTheDocument();
  });

  it('renders env picker on large viewport', () => {
    render(<Topbar {...defaultProps} viewport="lg" />);
    expect(screen.getByTestId('env-picker')).toBeInTheDocument();
  });

  it('hides env picker on narrow viewport', () => {
    render(<Topbar {...defaultProps} viewport="sm" />);
    expect(screen.queryByTestId('env-picker')).not.toBeInTheDocument();
  });

  it('renders notification bell button', () => {
    render(<Topbar {...defaultProps} />);
    expect(screen.getByTitle('topbar.notifications')).toBeInTheDocument();
  });

  it('opens notifications panel when bell clicked', async () => {
    const user = userEvent.setup();
    render(<Topbar {...defaultProps} />);
    await user.click(screen.getByTitle('topbar.notifications'));
    expect(screen.getByTestId('notif-panel')).toBeInTheDocument();
  });

  it('closes notifications panel when onClose called', async () => {
    const user = userEvent.setup();
    render(<Topbar {...defaultProps} />);
    await user.click(screen.getByTitle('topbar.notifications'));
    await user.click(screen.getByText('close-notif'));
    expect(screen.queryByTestId('notif-panel')).not.toBeInTheDocument();
  });

  it('renders theme toggle on non-xs viewport', () => {
    render(<Topbar {...defaultProps} viewport="lg" />);
    expect(screen.getByTitle('topbar.darkMode')).toBeInTheDocument();
  });

  it('calls toggleTheme when theme button clicked', async () => {
    const user = userEvent.setup();
    render(<Topbar {...defaultProps} viewport="lg" />);
    await user.click(screen.getByTitle('topbar.darkMode'));
    expect(mockToggleTheme).toHaveBeenCalled();
  });

  it('shows lightMode title when theme is dark', () => {
    mockTheme.current = 'dark';
    render(<Topbar {...defaultProps} viewport="lg" />);
    expect(screen.getByTitle('topbar.lightMode')).toBeInTheDocument();
  });

  it('renders lang switcher on non-xs viewport', () => {
    render(<Topbar {...defaultProps} viewport="lg" />);
    expect(screen.getByTestId('lang-switcher')).toBeInTheDocument();
  });

  it('hides lang switcher on xs viewport', () => {
    render(<Topbar {...defaultProps} viewport="xs" />);
    expect(screen.queryByTestId('lang-switcher')).not.toBeInTheDocument();
  });

  it('renders tweaks button on large viewport', () => {
    render(<Topbar {...defaultProps} viewport="lg" />);
    expect(screen.getByTitle('topbar.tweaks')).toBeInTheDocument();
  });

  it('calls onOpenTweaks when tweaks button clicked', async () => {
    const onOpenTweaks = vi.fn();
    const user = userEvent.setup();
    render(<Topbar {...defaultProps} viewport="lg" onOpenTweaks={onOpenTweaks} />);
    await user.click(screen.getByTitle('topbar.tweaks'));
    expect(onOpenTweaks).toHaveBeenCalled();
  });

  it('renders user menu in compact mode on xs viewport', () => {
    render(<Topbar {...defaultProps} viewport="xs" />);
    expect(screen.getByTestId('user-menu-compact-true')).toBeInTheDocument();
  });

  it('renders user menu in non-compact mode on large viewport', () => {
    render(<Topbar {...defaultProps} viewport="lg" />);
    expect(screen.getByTestId('user-menu-compact-false')).toBeInTheDocument();
  });
});
