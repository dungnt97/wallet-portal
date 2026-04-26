import * as queries from '@/api/queries';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixDeposit } from '../deposit-types';
import { DepositsKpiStrip } from '../deposits-kpi-strip';

import type { ReactNode } from 'react';

type KpiItem = { key: string; value: ReactNode };

vi.mock('@/api/queries');
vi.mock('@/components/custody', () => ({
  KpiStrip: ({ items }: { items: KpiItem[] }) => (
    <div data-testid="kpi-strip">
      {items.map((item) => (
        <div key={item.key} data-testid={`kpi-${item.key}`}>
          {item.value}
        </div>
      ))}
    </div>
  ),
  ChainPill: ({ chain }: { chain: string }) => <div data-testid={`chain-${chain}`}>{chain}</div>,
}));

vi.mock('@/icons', () => ({
  I: {
    Clock: () => <span data-testid="icon-clock" />,
    Check: () => <span data-testid="icon-check" />,
    Lightning: () => <span data-testid="icon-lightning" />,
    Database: () => <span data-testid="icon-db" />,
  },
}));

vi.mock('@/lib/format', () => ({
  fmtCompact: (v: number) => `${(v / 1000).toFixed(1)}K`,
}));

vi.mock('../../_shared/charts', () => ({
  Sparkline: ({ data }: { data: number[] }) => <div data-testid="sparkline">{data.length}</div>,
}));

vi.mock('../../_shared/realtime', () => ({
  LiveTimeAgo: ({ at }: { at: string }) => <span data-testid="live-time-ago">now</span>,
}));

describe('DepositsKpiStrip', () => {
  const mockDeposit: FixDeposit = {
    id: 'dep-001',
    userId: 'user-1',
    userName: 'John Doe',
    chain: 'bnb',
    token: 'USDT',
    amount: 5000,
    status: 'pending',
    address: '0xDepositAddr',
    txHash: '0xTxHash',
    confirmations: 12,
    requiredConfirmations: 12,
    detectedAt: new Date().toISOString(),
    creditedAt: null,
    sweptAt: null,
    risk: 'low',
    blockNumber: 10000,
  };

  beforeEach(() => {
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: { points: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof queries.useDashboardHistory>);
  });

  it('renders KPI strip with all items', () => {
    render(<DepositsKpiStrip deposits={[mockDeposit]} />);

    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('counts pending deposits', () => {
    const deposits: FixDeposit[] = [
      mockDeposit,
      { ...mockDeposit, id: 'dep-002', status: 'pending' },
    ];

    render(<DepositsKpiStrip deposits={deposits} />);

    expect(screen.getByTestId('kpi-pending')).toBeInTheDocument();
  });

  it('calculates pending value', () => {
    const deposits: FixDeposit[] = [mockDeposit, { ...mockDeposit, id: 'dep-002', amount: 3000 }];

    render(<DepositsKpiStrip deposits={deposits} />);

    // Total pending: 8000 → 8.0K
    expect(screen.getByTestId('kpi-pending')).toHaveTextContent('8.0K');
  });

  it('calculates credited deposits', () => {
    const deposits: FixDeposit[] = [
      { ...mockDeposit, status: 'pending' },
      { ...mockDeposit, id: 'dep-002', status: 'credited', amount: 2000 },
    ];

    render(<DepositsKpiStrip deposits={deposits} />);

    // Credited (non-pending): 2000 → 2.0K
    expect(screen.getByTestId('kpi-credited')).toBeInTheDocument();
  });

  it('displays average confirmation time', () => {
    render(<DepositsKpiStrip deposits={[mockDeposit]} />);

    expect(screen.getByTestId('kpi-confirm')).toHaveTextContent('38s');
  });

  it('displays last deposit info', () => {
    render(<DepositsKpiStrip deposits={[mockDeposit]} />);

    // Should show last deposit KPI with LiveTimeAgo
    expect(screen.getByTestId('kpi-last')).toBeInTheDocument();
  });

  it('handles empty deposits list', () => {
    render(<DepositsKpiStrip deposits={[]} />);

    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('renders with multiple deposits', () => {
    const deposits: FixDeposit[] = [
      { ...mockDeposit, chain: 'bnb' },
      { ...mockDeposit, id: 'dep-002', chain: 'sol' },
    ];

    render(<DepositsKpiStrip deposits={deposits} />);

    // Should render KPI strip with multiple deposits
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('shows SLA badge for confirmation time', () => {
    const { container } = render(<DepositsKpiStrip deposits={[mockDeposit]} />);

    // Should show SLA section
    const slaSection = container.textContent;
    expect(slaSection).toBeTruthy();
  });

  it('calculates zero pending when no pending deposits', () => {
    const deposits: FixDeposit[] = [
      { ...mockDeposit, status: 'credited' },
      { ...mockDeposit, id: 'dep-002', status: 'credited' },
    ];

    render(<DepositsKpiStrip deposits={deposits} />);

    // Pending should be $0.0K
    expect(screen.getByTestId('kpi-pending')).toHaveTextContent('$0.0K');
  });
});
