/* biome-ignore lint/suspicious/noExplicitAny: mocking utilities require any types */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MultisigOpsTable } from '../multisig-ops-table';
import type { MultisigOpDisplay } from '../multisig-types';

vi.mock('@/components/custody', () => ({
  ChainPill: ({ chain }: { chain: string }) => <div data-testid={`chain-${chain}`}>{chain}</div>,
  StatusBadge: ({ status }: { status: string }) => (
    <div data-testid={`status-${status}`}>{status}</div>
  ),
  Tabs: ({ tabs, value, onChange }: any) => (
    <div data-testid="tabs">
      {tabs.map((t: any) => (
        <button key={t.value} onClick={() => onChange(t.value)} data-testid={`tab-${t.value}`}>
          {t.label} ({t.count})
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/icons', () => ({
  I: {
    Check: () => <span data-testid="icon-check" />,
  },
}));

vi.mock('@/lib/format', () => ({
  fmtUSD: (v: number) => `$${v.toFixed(2)}`,
}));

vi.mock('../../_shared/realtime', () => ({
  LiveTimeAgo: () => <span data-testid="live-time-ago">ago</span>,
}));

describe('MultisigOpsTable', () => {
  const mockOp: MultisigOpDisplay = {
    id: 'op-000001',
    withdrawalId: 'wd-001',
    operationType: 'withdraw',
    chain: 'bnb',
    multisigAddr: '0xSafeAddr',
    safeName: 'Main Vault',
    amount: 5000,
    token: 'USDC',
    destination: '0xDest',
    nonce: 1,
    total: 3,
    collected: 2,
    required: 2,
    approvers: [],
    rejectedBy: null,
    status: 'collecting',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  it('renders table with headers', () => {
    const mockNavigate = vi.fn();
    const { container } = render(
      <MultisigOpsTable
        tab="pending"
        onTabChange={mockNavigate}
        pendingCount={1}
        failedCount={0}
        list={[mockOp]}
        onSelect={mockNavigate}
      />
    );

    const table = container.querySelector('.table');
    expect(table).toBeInTheDocument();

    const headers = container.querySelectorAll('th');
    expect(headers.length).toBeGreaterThan(0);
  });

  it('renders pending and failed tabs', () => {
    const mockNavigate = vi.fn();
    render(
      <MultisigOpsTable
        tab="pending"
        onTabChange={mockNavigate}
        pendingCount={2}
        failedCount={1}
        list={[mockOp]}
        onSelect={mockNavigate}
      />
    );

    expect(screen.getByTestId('tab-pending')).toBeInTheDocument();
    expect(screen.getByTestId('tab-failed')).toBeInTheDocument();
  });

  it('calls onTabChange when tab is clicked', async () => {
    const mockTabChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MultisigOpsTable
        tab="pending"
        onTabChange={mockTabChange}
        pendingCount={1}
        failedCount={0}
        list={[mockOp]}
        onSelect={vi.fn()}
      />
    );

    await user.click(screen.getByTestId('tab-failed'));
    expect(mockTabChange).toHaveBeenCalledWith('failed');
  });

  it('renders operation rows with data', () => {
    const mockNavigate = vi.fn();
    const { container } = render(
      <MultisigOpsTable
        tab="pending"
        onTabChange={mockNavigate}
        pendingCount={1}
        failedCount={0}
        list={[mockOp]}
        onSelect={mockNavigate}
      />
    );

    const tbody = container.querySelector('tbody');
    expect(tbody).toBeInTheDocument();

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
  });

  it('displays operation details in row', () => {
    const mockNavigate = vi.fn();
    const { container } = render(
      <MultisigOpsTable
        tab="pending"
        onTabChange={mockNavigate}
        pendingCount={1}
        failedCount={0}
        list={[mockOp]}
        onSelect={mockNavigate}
      />
    );

    // Should display truncated ID
    expect(screen.getByText(/op-000001/)).toBeInTheDocument();

    // Should display vault name
    expect(screen.getByText('Main Vault')).toBeInTheDocument();

    // Should display operation type
    expect(screen.getByText('withdraw')).toBeInTheDocument();
  });

  it('renders chain pill for each operation', () => {
    const mockNavigate = vi.fn();
    render(
      <MultisigOpsTable
        tab="pending"
        onTabChange={mockNavigate}
        pendingCount={1}
        failedCount={0}
        list={[mockOp]}
        onSelect={mockNavigate}
      />
    );

    expect(screen.getByTestId('chain-bnb')).toBeInTheDocument();
  });

  it('renders approval indicators', () => {
    const mockNavigate = vi.fn();
    const { container } = render(
      <MultisigOpsTable
        tab="pending"
        onTabChange={mockNavigate}
        pendingCount={1}
        failedCount={0}
        list={[mockOp]}
        onSelect={mockNavigate}
      />
    );

    const approvalPips = container.querySelectorAll('.approval-pip');
    expect(approvalPips.length).toBe(3); // 3 total signers

    // 2 collected (approved) + 1 pending
    const approvedPips = container.querySelectorAll('.approval-pip.approved');
    expect(approvedPips.length).toBe(2);
  });

  it('calls onSelect when row is clicked', async () => {
    const mockSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <MultisigOpsTable
        tab="pending"
        onTabChange={vi.fn()}
        pendingCount={1}
        failedCount={0}
        list={[mockOp]}
        onSelect={mockSelect}
      />
    );

    const row = container.querySelector('tbody tr');
    if (row) {
      await user.click(row);
      expect(mockSelect).toHaveBeenCalledWith(mockOp);
    }
  });

  it('shows empty state when no operations', () => {
    const mockNavigate = vi.fn();
    const { container } = render(
      <MultisigOpsTable
        tab="pending"
        onTabChange={mockNavigate}
        pendingCount={0}
        failedCount={0}
        list={[]}
        onSelect={mockNavigate}
      />
    );

    const emptyState = container.querySelector('.table-empty');
    expect(emptyState).toBeInTheDocument();
  });

  it('displays operation amount and token', () => {
    const mockNavigate = vi.fn();
    const { container } = render(
      <MultisigOpsTable
        tab="pending"
        onTabChange={mockNavigate}
        pendingCount={1}
        failedCount={0}
        list={[mockOp]}
        onSelect={mockNavigate}
      />
    );

    // Should display formatted USD amount
    expect(screen.getByText(/\$5000/)).toBeInTheDocument();
    // Should display token
    expect(screen.getByText('USDC')).toBeInTheDocument();
  });

  it('handles operations with zero amount', () => {
    const mockNavigate = vi.fn();
    const zeroAmountOp: MultisigOpDisplay = {
      ...mockOp,
      amount: 0,
    };

    const { container } = render(
      <MultisigOpsTable
        tab="pending"
        onTabChange={mockNavigate}
        pendingCount={1}
        failedCount={0}
        list={[zeroAmountOp]}
        onSelect={mockNavigate}
      />
    );

    // Should show dash for zero amount
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('displays approval count as collected/required', () => {
    const mockNavigate = vi.fn();
    render(
      <MultisigOpsTable
        tab="pending"
        onTabChange={mockNavigate}
        pendingCount={1}
        failedCount={0}
        list={[mockOp]}
        onSelect={mockNavigate}
      />
    );

    // Should show "2/2" for collected/required
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });
});
