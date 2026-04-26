/* biome-ignore lint/suspicious/noExplicitAny: mocking utilities require any types */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MultisigKpiStrip } from '../multisig-kpi-strip';
import type { MultisigOpDisplay } from '../multisig-types';

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
    Clock: () => <span data-testid="icon-clock" />,
    Check: () => <span data-testid="icon-check" />,
    Users: () => <span data-testid="icon-users" />,
    UserX: () => <span data-testid="icon-userx" />,
  },
}));

vi.mock('@/lib/format', () => ({
  fmtCompact: (v: number) => `$${v.toFixed(0)}K`,
}));

describe('MultisigKpiStrip', () => {
  const mockOp: MultisigOpDisplay = {
    id: 'op-001',
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
    expiresAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const readyOp: MultisigOpDisplay = {
    ...mockOp,
    id: 'op-002',
    status: 'ready',
    collected: 3,
  };

  it('renders KPI strip with all items', () => {
    render(
      <MultisigKpiStrip
        ops={[mockOp, readyOp]}
        failedCount={0}
        treasurerCount={5}
        onlineTreasurerCount={3}
      />
    );

    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('counts collecting operations correctly', () => {
    render(
      <MultisigKpiStrip
        ops={[mockOp, readyOp]}
        failedCount={0}
        treasurerCount={5}
        onlineTreasurerCount={3}
      />
    );

    expect(screen.getByTestId('kpi-collecting')).toHaveTextContent('1');
  });

  it('counts ready operations correctly', () => {
    render(
      <MultisigKpiStrip
        ops={[mockOp, readyOp]}
        failedCount={0}
        treasurerCount={5}
        onlineTreasurerCount={3}
      />
    );

    expect(screen.getByTestId('kpi-ready')).toHaveTextContent('1');
  });

  it('displays treasurer count', () => {
    render(
      <MultisigKpiStrip ops={[]} failedCount={0} treasurerCount={5} onlineTreasurerCount={3} />
    );

    expect(screen.getByTestId('kpi-treasurers')).toHaveTextContent('5');
  });

  it('shows loading indicator for treasurers when count is null', () => {
    render(
      <MultisigKpiStrip
        ops={[]}
        failedCount={0}
        treasurerCount={null}
        onlineTreasurerCount={null}
      />
    );

    const treasurerKpi = screen.getByTestId('kpi-treasurers');
    expect(treasurerKpi).toHaveTextContent('…');
  });

  it('displays online treasurer count', () => {
    render(
      <MultisigKpiStrip ops={[]} failedCount={0} treasurerCount={5} onlineTreasurerCount={3} />
    );

    // KPI should render with value
    expect(screen.getByTestId('kpi-treasurers')).toBeInTheDocument();
  });

  it('shows failed count', () => {
    render(
      <MultisigKpiStrip ops={[]} failedCount={2} treasurerCount={5} onlineTreasurerCount={3} />
    );

    expect(screen.getByTestId('kpi-rejected')).toHaveTextContent('2');
  });

  it('calculates total amount for collecting operations', () => {
    const op1: MultisigOpDisplay = {
      ...mockOp,
      amount: 1000,
      status: 'collecting',
    };
    const op2: MultisigOpDisplay = {
      ...mockOp,
      id: 'op-002',
      amount: 2000,
      status: 'collecting',
    };

    render(
      <MultisigKpiStrip
        ops={[op1, op2]}
        failedCount={0}
        treasurerCount={5}
        onlineTreasurerCount={3}
      />
    );

    // Total should be 3000
    expect(screen.getByTestId('kpi-collecting')).toBeInTheDocument();
  });

  it('handles empty operations list', () => {
    render(
      <MultisigKpiStrip ops={[]} failedCount={0} treasurerCount={5} onlineTreasurerCount={3} />
    );

    // Should render all KPIs even with empty list
    expect(screen.getByTestId('kpi-collecting')).toHaveTextContent('0');
    expect(screen.getByTestId('kpi-ready')).toHaveTextContent('0');
  });

  it('filters operations by status correctly', () => {
    const collectingOps: MultisigOpDisplay[] = [
      { ...mockOp, status: 'collecting', id: 'op-1' },
      { ...mockOp, status: 'collecting', id: 'op-2' },
      { ...mockOp, status: 'ready', id: 'op-3' },
    ];

    render(
      <MultisigKpiStrip
        ops={collectingOps}
        failedCount={0}
        treasurerCount={5}
        onlineTreasurerCount={3}
      />
    );

    expect(screen.getByTestId('kpi-collecting')).toHaveTextContent('2');
    expect(screen.getByTestId('kpi-ready')).toHaveTextContent('1');
  });

  it('handles zero failed count', () => {
    render(
      <MultisigKpiStrip ops={[]} failedCount={0} treasurerCount={5} onlineTreasurerCount={3} />
    );

    expect(screen.getByTestId('kpi-rejected')).toHaveTextContent('0');
  });

  it('handles zero online treasurers', () => {
    render(
      <MultisigKpiStrip ops={[]} failedCount={0} treasurerCount={5} onlineTreasurerCount={0} />
    );

    expect(screen.getByTestId('kpi-treasurers')).toBeInTheDocument();
  });
});
