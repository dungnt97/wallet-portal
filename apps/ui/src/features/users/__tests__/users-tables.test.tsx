import type { StaffMemberRow } from '@/api/queries';
import type { UserRecord } from '@/api/users';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EndUsersTable, StaffTable } from '../users-tables';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/components/custody', () => ({
  Address: ({ addr }: { addr: string }) => <span data-testid="address">{addr}</span>,
  Risk: ({ level }: { level: string }) => <span data-testid={`risk-${level}`}>{level}</span>,
}));

vi.mock('@/lib/constants', () => ({
  ROLES: {
    admin: { label: 'Admin' },
    treasurer: { label: 'Treasurer' },
    operator: { label: 'Operator' },
    viewer: { label: 'Viewer' },
  },
}));

vi.mock('@/api/users', () => ({
  KYC_LABELS: {
    none: 'None',
    basic: 'Basic',
    full: 'Full',
  },
}));

vi.mock('@/features/_shared/realtime', () => ({
  LiveTimeAgo: ({ at }: { at: string }) => <span data-testid="live-time-ago">{at}</span>,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockStaff: StaffMemberRow = {
  id: 'staff-1',
  name: 'Alice Chen',
  email: 'alice@test.com',
  role: 'admin',
  status: 'active',
  initials: 'AC',
  createdAt: new Date().toISOString(),
};

const mockUser: UserRecord = {
  id: 'user-1',
  email: 'user@test.com',
  kycTier: 'basic',
  status: 'active',
  riskScore: 20,
  createdAt: new Date().toISOString(),
  addresses: [],
};

// ── StaffTable ─────────────────────────────────────────────────────────────────

describe('StaffTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders table with staff rows', () => {
    render(<StaffTable rows={[mockStaff]} />);
    expect(screen.getByText('Alice Chen')).toBeInTheDocument();
  });

  it('shows empty state when no staff', () => {
    render(<StaffTable rows={[]} />);
    // Empty state td rendered
    const emptyTitle = document.querySelector('.table-empty-title');
    expect(emptyTitle).toBeInTheDocument();
  });

  it('renders staff initials', () => {
    render(<StaffTable rows={[mockStaff]} />);
    expect(screen.getByText('AC')).toBeInTheDocument();
  });

  it('renders staff email', () => {
    render(<StaffTable rows={[mockStaff]} />);
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
  });

  it('renders role pill with correct label', () => {
    render(<StaffTable rows={[mockStaff]} />);
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('shows active status badge', () => {
    render(<StaffTable rows={[mockStaff]} />);
    // Active badge uses 'badge ok' class
    const activeBadge = document.querySelector('.badge.ok');
    expect(activeBadge).toBeInTheDocument();
  });

  it('shows non-active status as plain badge', () => {
    const inactiveStaff = { ...mockStaff, status: 'inactive' };
    render(<StaffTable rows={[inactiveStaff]} />);
    expect(screen.getByText('inactive')).toBeInTheDocument();
  });

  it('renders multiple staff rows', () => {
    const staff2 = {
      ...mockStaff,
      id: 's2',
      name: 'Bob Smith',
      email: 'bob@test.com',
      initials: 'BS',
    };
    render(<StaffTable rows={[mockStaff, staff2]} />);
    expect(screen.getByText('Alice Chen')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<StaffTable rows={[]} />);
    expect(document.querySelector('thead')).toBeInTheDocument();
  });
});

// ── EndUsersTable ─────────────────────────────────────────────────────────────

describe('EndUsersTable', () => {
  const defaultProps = {
    rows: [mockUser],
    loading: false,
    showRiskFlags: true,
    onSelect: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('shows loading state', () => {
    render(<EndUsersTable {...defaultProps} loading={true} rows={[]} />);
    expect(document.querySelector('.table-empty')).toBeInTheDocument();
  });

  it('shows empty state when no users and not loading', () => {
    render(<EndUsersTable {...defaultProps} rows={[]} />);
    expect(document.querySelector('.table-empty')).toBeInTheDocument();
  });

  it('renders user email', () => {
    render(<EndUsersTable {...defaultProps} />);
    expect(screen.getByText('user@test.com')).toBeInTheDocument();
  });

  it('renders KYC tier badge', () => {
    render(<EndUsersTable {...defaultProps} />);
    expect(screen.getByText('Basic')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<EndUsersTable {...defaultProps} />);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('renders risk column when showRiskFlags=true', () => {
    render(<EndUsersTable {...defaultProps} showRiskFlags={true} />);
    // risk score 20 → low
    expect(screen.getByTestId('risk-low')).toBeInTheDocument();
  });

  it('hides risk column when showRiskFlags=false', () => {
    render(<EndUsersTable {...defaultProps} showRiskFlags={false} />);
    expect(screen.queryByTestId('risk-low')).not.toBeInTheDocument();
  });

  it('calls onSelect when row clicked', () => {
    const onSelect = vi.fn();
    render(<EndUsersTable {...defaultProps} onSelect={onSelect} />);
    const row = document.querySelector('tbody tr') as HTMLElement;
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(mockUser);
  });

  it('shows med risk for riskScore >= 40', () => {
    const highRiskUser = { ...mockUser, riskScore: 55 };
    render(<EndUsersTable {...defaultProps} rows={[highRiskUser]} />);
    expect(screen.getByTestId('risk-med')).toBeInTheDocument();
  });

  it('shows high risk for riskScore >= 70', () => {
    const veryHighRiskUser = { ...mockUser, riskScore: 85 };
    render(<EndUsersTable {...defaultProps} rows={[veryHighRiskUser]} />);
    expect(screen.getByTestId('risk-high')).toBeInTheDocument();
  });

  it('renders LiveTimeAgo for createdAt', () => {
    render(<EndUsersTable {...defaultProps} />);
    expect(screen.getByTestId('live-time-ago')).toBeInTheDocument();
  });

  it('renders multiple user rows', () => {
    const user2 = { ...mockUser, id: 'u2', email: 'other@test.com' };
    render(<EndUsersTable {...defaultProps} rows={[mockUser, user2]} />);
    expect(screen.getByText('user@test.com')).toBeInTheDocument();
    expect(screen.getByText('other@test.com')).toBeInTheDocument();
  });
});
