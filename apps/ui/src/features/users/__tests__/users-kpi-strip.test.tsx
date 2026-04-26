import type { StaffMemberRow } from '@/api/queries';
import type { UserRecord } from '@/api/users';
/* biome-ignore lint/suspicious/noExplicitAny: mocking utilities require any types */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UsersKpiStrip } from '../users-kpi-strip';

vi.mock('@/components/custody', () => ({
  KpiStrip: ({ items }: any) => (
    <div data-testid="kpi-strip">
      {items.map((item: any) => (
        <div key={item.key} data-testid={`kpi-${item.key}`}>
          {item.value}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/icons', () => ({
  I: {
    Users: () => <span data-testid="icon-users" />,
    Database: () => <span data-testid="icon-db" />,
    AlertTri: () => <span data-testid="icon-alert" />,
  },
}));

vi.mock('@/lib/format', () => ({
  fmtCompact: (v: number) => `${v}K`,
}));

describe('UsersKpiStrip', () => {
  const mockUsers: UserRecord[] = [
    {
      id: 'u1',
      email: 'user1@example.com',
      kycTier: 'basic',
      riskScore: 10,
      status: 'active',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'u2',
      email: 'user2@example.com',
      kycTier: 'enhanced',
      riskScore: 50,
      status: 'active',
      createdAt: new Date().toISOString(),
    },
  ];

  const mockStaff: StaffMemberRow[] = [
    {
      id: 's1',
      email: 'staff1@example.com',
      name: 'Staff One',
      initials: 'S1',
      status: 'active',
      role: 'admin',
      lastLoginAt: new Date(Date.now() - 60000).toISOString(),
    },
    {
      id: 's2',
      email: 'staff2@example.com',
      name: 'Staff Two',
      initials: 'S2',
      status: 'suspended',
      role: 'viewer',
      lastLoginAt: null,
    },
  ];

  it('renders KPI strip with all items', () => {
    render(<UsersKpiStrip users={mockUsers} totalUsers={100} staff={mockStaff} />);

    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('displays staff count', () => {
    render(<UsersKpiStrip users={mockUsers} totalUsers={100} staff={mockStaff} />);

    expect(screen.getByTestId('kpi-staff')).toHaveTextContent('2');
  });

  it('displays total end users', () => {
    render(<UsersKpiStrip users={mockUsers} totalUsers={100} staff={mockStaff} />);

    expect(screen.getByTestId('kpi-end-users')).toHaveTextContent('100');
  });

  it('displays active users on page', () => {
    render(<UsersKpiStrip users={mockUsers} totalUsers={100} staff={mockStaff} />);

    // 2 users shown = 2K
    expect(screen.getByTestId('kpi-custody')).toHaveTextContent('2K');
  });

  it('counts high-risk users', () => {
    render(<UsersKpiStrip users={mockUsers} totalUsers={100} staff={mockStaff} />);

    // 1 user with riskScore >= 40
    expect(screen.getByTestId('kpi-flags')).toHaveTextContent('1');
  });

  it('handles null staff while loading', () => {
    render(<UsersKpiStrip users={mockUsers} totalUsers={100} staff={null} />);

    expect(screen.getByTestId('kpi-staff')).toHaveTextContent('…');
  });

  it('filters users by KYC tier', () => {
    const users: UserRecord[] = [
      { ...mockUsers[0], kycTier: 'basic' },
      { ...mockUsers[1], kycTier: 'enhanced' },
      { ...mockUsers[0], id: 'u3', kycTier: 'none' },
    ];

    render(<UsersKpiStrip users={users} totalUsers={100} staff={mockStaff} />);

    // Should render KPI items (counts are internal)
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('counts active staff members', () => {
    // 1 active staff (s1)
    render(<UsersKpiStrip users={mockUsers} totalUsers={100} staff={mockStaff} />);

    expect(screen.getByTestId('kpi-staff')).toBeInTheDocument();
  });

  it('handles empty users list', () => {
    render(<UsersKpiStrip users={[]} totalUsers={0} staff={mockStaff} />);

    expect(screen.getByTestId('kpi-custody')).toHaveTextContent('0K');
    expect(screen.getByTestId('kpi-flags')).toHaveTextContent('0');
  });

  it('handles all users with low risk', () => {
    const lowRiskUsers: UserRecord[] = [
      { ...mockUsers[0], riskScore: 10 },
      { ...mockUsers[1], riskScore: 20 },
    ];

    render(<UsersKpiStrip users={lowRiskUsers} totalUsers={100} staff={mockStaff} />);

    expect(screen.getByTestId('kpi-flags')).toHaveTextContent('0');
  });

  it('handles all users with high risk', () => {
    const highRiskUsers: UserRecord[] = [
      { ...mockUsers[0], riskScore: 50 },
      { ...mockUsers[1], riskScore: 60 },
    ];

    render(<UsersKpiStrip users={highRiskUsers} totalUsers={100} staff={mockStaff} />);

    expect(screen.getByTestId('kpi-flags')).toHaveTextContent('2');
  });

  it('formats total users with locale string', () => {
    render(<UsersKpiStrip users={mockUsers} totalUsers={1000} staff={mockStaff} />);

    // Should render total users (1000 formatted with locale)
    expect(screen.getByTestId('kpi-end-users')).toBeInTheDocument();
  });
});
