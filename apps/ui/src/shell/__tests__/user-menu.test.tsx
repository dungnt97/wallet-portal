import { AuthContext } from '@/auth/auth-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserMenu } from '../user-menu';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/icons', () => ({
  I: {
    ChevronDown: () => <span data-testid="icon-chevron-down" />,
    Settings: () => <span data-testid="icon-settings" />,
    Shield: () => <span data-testid="icon-shield" />,
    Bell: () => <span data-testid="icon-bell" />,
    LogOut: () => <span data-testid="icon-logout" />,
  },
}));

vi.mock('@/features/notifs/notif-prefs-modal', () => ({
  NotifPrefsModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="notif-prefs-modal" /> : null,
}));

vi.mock('@/lib/constants', () => ({
  ROLES: {
    admin: { label: 'Admin' },
    treasurer: { label: 'Treasurer' },
    operator: { label: 'Operator' },
    viewer: { label: 'Viewer' },
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockStaff = {
  id: 'u1',
  name: 'Alice Chen',
  email: 'alice@test.com',
  role: 'admin' as const,
  initials: 'AC',
};

type MenuProps = {
  compact?: boolean;
  onOpenAccount?: () => void;
  onOpenSecurity?: () => void;
};

function renderMenu(props: MenuProps = {}, staffOverride = mockStaff) {
  const authCtx = {
    staff: staffOverride,
    loading: false,
    initiateLogin: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    hasPerm: vi.fn(() => true),
  };
  return {
    authCtx,
    ...render(
      <AuthContext.Provider value={authCtx}>
        <UserMenu {...props} />
      </AuthContext.Provider>
    ),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UserMenu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when staff is null', () => {
    const authCtx = {
      staff: null,
      loading: false,
      initiateLogin: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
      hasPerm: vi.fn(),
    };
    render(
      <AuthContext.Provider value={authCtx}>
        <UserMenu />
      </AuthContext.Provider>
    );
    expect(document.querySelector('.user-menu-trigger')).not.toBeInTheDocument();
  });

  it('renders avatar with staff initials', () => {
    renderMenu();
    expect(screen.getByText('AC')).toBeInTheDocument();
  });

  it('renders first name next to avatar in non-compact mode', () => {
    renderMenu({ compact: false });
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('does not render first name in compact mode', () => {
    renderMenu({ compact: true });
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('menu is closed by default', () => {
    renderMenu();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens menu when trigger button clicked', () => {
    renderMenu();
    const trigger = document.querySelector('.user-menu-trigger') as HTMLButtonElement;
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows staff name in menu header', () => {
    renderMenu();
    const trigger = document.querySelector('.user-menu-trigger') as HTMLButtonElement;
    fireEvent.click(trigger);
    expect(screen.getByText('Alice Chen')).toBeInTheDocument();
  });

  it('shows staff email in menu header', () => {
    renderMenu();
    fireEvent.click(document.querySelector('.user-menu-trigger') as HTMLButtonElement);
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
  });

  it('shows role pill in menu header', () => {
    renderMenu();
    fireEvent.click(document.querySelector('.user-menu-trigger') as HTMLButtonElement);
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('closes menu when trigger clicked again', () => {
    renderMenu();
    const trigger = document.querySelector('.user-menu-trigger') as HTMLButtonElement;
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls logout when sign out clicked', () => {
    const logout = vi.fn();
    const authCtx = {
      staff: mockStaff,
      loading: false,
      initiateLogin: vi.fn(),
      logout,
      refresh: vi.fn(),
      hasPerm: vi.fn(),
    };
    render(
      <AuthContext.Provider value={authCtx}>
        <UserMenu />
      </AuthContext.Provider>
    );
    fireEvent.click(document.querySelector('.user-menu-trigger') as HTMLButtonElement);
    const signOutBtn = document.querySelector('.user-menu-item.danger') as HTMLButtonElement;
    fireEvent.click(signOutBtn);
    expect(logout).toHaveBeenCalled();
  });

  it('closes menu after sign out', () => {
    renderMenu();
    fireEvent.click(document.querySelector('.user-menu-trigger') as HTMLButtonElement);
    const signOutBtn = document.querySelector('.user-menu-item.danger') as HTMLButtonElement;
    fireEvent.click(signOutBtn);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onOpenAccount when settings clicked', () => {
    const onOpenAccount = vi.fn();
    renderMenu({ onOpenAccount });
    fireEvent.click(document.querySelector('.user-menu-trigger') as HTMLButtonElement);
    const settingsItems = document.querySelectorAll('.user-menu-item');
    fireEvent.click(settingsItems[0]);
    expect(onOpenAccount).toHaveBeenCalled();
  });

  it('calls onOpenSecurity when security clicked', () => {
    const onOpenSecurity = vi.fn();
    renderMenu({ onOpenSecurity });
    fireEvent.click(document.querySelector('.user-menu-trigger') as HTMLButtonElement);
    const menuItems = document.querySelectorAll('.user-menu-item');
    fireEvent.click(menuItems[1]);
    expect(onOpenSecurity).toHaveBeenCalled();
  });

  it('opens notification prefs modal when notification item clicked', () => {
    renderMenu();
    fireEvent.click(document.querySelector('.user-menu-trigger') as HTMLButtonElement);
    const menuItems = document.querySelectorAll('.user-menu-item');
    fireEvent.click(menuItems[2]);
    expect(screen.getByTestId('notif-prefs-modal')).toBeInTheDocument();
  });

  it('trigger has aria-haspopup=menu', () => {
    renderMenu();
    const trigger = document.querySelector('.user-menu-trigger') as HTMLButtonElement;
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('trigger has aria-expanded=false when closed', () => {
    renderMenu();
    const trigger = document.querySelector('.user-menu-trigger') as HTMLButtonElement;
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('trigger has aria-expanded=true when open', () => {
    renderMenu();
    const trigger = document.querySelector('.user-menu-trigger') as HTMLButtonElement;
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes menu when outside click fires', () => {
    renderMenu();
    fireEvent.click(document.querySelector('.user-menu-trigger') as HTMLButtonElement);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
