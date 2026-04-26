// Smoke tests for features/users/users-page.tsx — staff + end-user tabs, invite/add modals.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
        ({ size }: { size?: number }) => (
          <span data-testid={`icon-${String(key)}`} data-size={size} />
        ),
    }
  ),
}));

const mockToast = vi.fn();
vi.mock('@/components/overlays', () => ({
  useToast: () => mockToast,
}));

vi.mock('@/components/custody', () => ({
  PageFrame: ({
    title,
    policyStrip,
    actions,
    kpis,
    children,
  }: {
    title: React.ReactNode;
    eyebrow?: React.ReactNode;
    policyStrip?: React.ReactNode;
    actions?: React.ReactNode;
    kpis?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="page-frame">
      <h1>{title}</h1>
      <div data-testid="policy-strip">{policyStrip}</div>
      <div data-testid="actions">{actions}</div>
      <div data-testid="kpis">{kpis}</div>
      {children}
    </div>
  ),
  Tabs: ({
    onChange,
    tabs,
  }: {
    value: string;
    onChange: (v: string) => void;
    tabs: Array<{ value: string; label: string; count?: number }>;
    embedded?: boolean;
  }) => (
    <div data-testid="tabs">
      {tabs.map((tab) => (
        <button key={tab.value} type="button" onClick={() => onChange(tab.value)}>
          {tab.label}
        </button>
      ))}
    </div>
  ),
  Filter: ({
    label,
    onClick,
  }: {
    label: string;
    value?: string;
    active?: boolean;
    onClick: () => void;
    onClear?: () => void;
  }) => (
    <button type="button" data-testid={`filter-${label}`} onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('@/features/_shared/realtime', () => ({
  LiveDot: () => <span data-testid="live-dot" />,
}));

vi.mock('@/features/_shared/helpers', () => ({
  downloadCSV: vi.fn(),
}));

const mockUseAuth = vi.fn();
vi.mock('@/auth/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseTweaksStore = vi.fn((_selector?: unknown) => false);
vi.mock('@/stores/tweaks-store', () => ({
  useTweaksStore: (selector: (s: { showRiskFlags: boolean }) => boolean) =>
    mockUseTweaksStore(selector),
}));

const mockUseStaffList = vi.fn();
vi.mock('@/api/queries', () => ({
  useStaffList: (params: unknown) => mockUseStaffList(params),
}));

const mockUseUserList = vi.fn();
vi.mock('@/api/users', () => ({
  useUserList: (params: unknown) => mockUseUserList(params),
}));

vi.mock('../invite-modal', () => ({
  InviteModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="invite-modal">
        <button type="button" onClick={onClose}>
          close-invite
        </button>
      </div>
    ) : null,
}));

vi.mock('../users-detail-sheet', () => ({
  UserDetailSheet: ({
    userId,
    onClose,
  }: { userId: string | null; showRiskFlags?: boolean; onClose: () => void }) =>
    userId ? (
      <div data-testid="user-detail-sheet">
        <button type="button" onClick={onClose}>
          close-detail
        </button>
      </div>
    ) : null,
}));

vi.mock('../users-kpi-strip', () => ({
  UsersKpiStrip: () => <div data-testid="users-kpi-strip" />,
}));

vi.mock('../users-modals', () => ({
  AddUserModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="add-user-modal">
        <button type="button" onClick={onClose}>
          close-add-user
        </button>
      </div>
    ) : null,
}));

vi.mock('../users-tables', () => ({
  StaffTable: ({ rows }: { rows: unknown[] }) => (
    <div data-testid="staff-table">{(rows ?? []).length} members</div>
  ),
  EndUsersTable: ({
    rows,
  }: { rows: unknown[]; loading?: boolean; showRiskFlags?: boolean; onSelect?: unknown }) => (
    <div data-testid="end-users-table">{(rows ?? []).length} users</div>
  ),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { UsersPage } from '../users-page';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdmin() {
  return { staffId: 'admin-1', email: 'admin@test.com', role: 'admin' };
}

function makeOperator() {
  return { staffId: 'op-1', email: 'op@test.com', role: 'operator' };
}

function renderPage(role: 'admin' | 'operator' | 'viewer' = 'admin') {
  const staff =
    role === 'admin'
      ? makeAdmin()
      : role === 'operator'
        ? makeOperator()
        : { ...makeAdmin(), role: 'viewer' };
  mockUseAuth.mockReturnValue({ staff });
  mockUseStaffList.mockReturnValue({ data: { data: [], total: 0 } });
  mockUseUserList.mockReturnValue({ data: { data: [], total: 0 } });
  return render(<UsersPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UsersPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders page frame', () => {
    renderPage();
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders users.title', () => {
    renderPage();
    expect(screen.getByText('users.title')).toBeInTheDocument();
  });

  it('renders staff table by default', () => {
    renderPage();
    expect(screen.getByTestId('staff-table')).toBeInTheDocument();
  });

  it('does not render end-users table by default', () => {
    renderPage();
    expect(screen.queryByTestId('end-users-table')).not.toBeInTheDocument();
  });

  it('renders policy strip with live dot', () => {
    renderPage();
    expect(screen.getByTestId('live-dot')).toBeInTheDocument();
  });

  it('renders KPI strip', () => {
    renderPage();
    expect(screen.getByTestId('users-kpi-strip')).toBeInTheDocument();
  });

  it('renders export button', () => {
    renderPage();
    expect(screen.getByText('common.export')).toBeInTheDocument();
  });

  it('renders invite staff button for admin', () => {
    renderPage('admin');
    expect(screen.getByText('users.inviteStaff')).toBeInTheDocument();
  });

  it('invite button is enabled for admin', () => {
    renderPage('admin');
    const btn = screen.getByText('users.inviteStaff').closest('button') as HTMLButtonElement;
    expect(btn).not.toBeDisabled();
  });

  it('invite button is disabled for non-admin', () => {
    renderPage('operator');
    const btn = screen.getByText('users.inviteStaff').closest('button') as HTMLButtonElement;
    expect(btn).toBeDisabled();
  });

  it('opens invite modal when invite button clicked', async () => {
    const user = userEvent.setup();
    renderPage('admin');
    await user.click(screen.getByText('users.inviteStaff').closest('button') as HTMLElement);
    expect(screen.getByTestId('invite-modal')).toBeInTheDocument();
  });

  it('closes invite modal when onClose called', async () => {
    const user = userEvent.setup();
    renderPage('admin');
    await user.click(screen.getByText('users.inviteStaff').closest('button') as HTMLElement);
    await user.click(screen.getByText('close-invite'));
    expect(screen.queryByTestId('invite-modal')).not.toBeInTheDocument();
  });

  it('switches to end-users tab', async () => {
    mockUseAuth.mockReturnValue({ staff: makeAdmin() });
    mockUseStaffList.mockReturnValue({ data: { data: [], total: 0 } });
    mockUseUserList.mockReturnValue({ data: { data: [], total: 0 } });
    const user = userEvent.setup();
    render(<UsersPage />);
    await user.click(screen.getByText('users.tabUsers'));
    expect(screen.getByTestId('end-users-table')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-table')).not.toBeInTheDocument();
  });

  it('shows add-user button on endusers tab', async () => {
    mockUseAuth.mockReturnValue({ staff: makeAdmin() });
    mockUseStaffList.mockReturnValue({ data: { data: [], total: 0 } });
    mockUseUserList.mockReturnValue({ data: { data: [], total: 0 } });
    const user = userEvent.setup();
    render(<UsersPage />);
    await user.click(screen.getByText('users.tabUsers'));
    expect(screen.getByText('users.addUser')).toBeInTheDocument();
  });

  it('opens add-user modal when add-user button clicked', async () => {
    mockUseAuth.mockReturnValue({ staff: makeAdmin() });
    mockUseStaffList.mockReturnValue({ data: { data: [], total: 0 } });
    mockUseUserList.mockReturnValue({ data: { data: [], total: 0 } });
    const user = userEvent.setup();
    render(<UsersPage />);
    await user.click(screen.getByText('users.tabUsers'));
    await user.click(screen.getByText('users.addUser').closest('button') as HTMLElement);
    expect(screen.getByTestId('add-user-modal')).toBeInTheDocument();
  });

  it('shows staff members from staffQuery', () => {
    mockUseAuth.mockReturnValue({ staff: makeAdmin() });
    mockUseStaffList.mockReturnValue({
      data: {
        data: [{ id: 's1', name: 'Alice', email: 'a@b.com', role: 'admin', status: 'active' }],
        total: 1,
      },
    });
    mockUseUserList.mockReturnValue({ data: { data: [], total: 0 } });
    render(<UsersPage />);
    expect(screen.getByText('1 members')).toBeInTheDocument();
  });
});
