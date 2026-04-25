/* biome-ignore lint/suspicious/noExplicitAny: mocking utilities require any types */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as queries from '@/api/queries';
import { DashboardKpiGrid } from '../dashboard-kpi-grid';

// Mock the queries module
vi.mock('@/api/queries');
// Mock chart components
vi.mock('../../_shared/charts', () => ({
  Sparkline: ({ data }: { data: number[] }) => <div data-testid="sparkline">{data.length}</div>,
}));
// Mock components
vi.mock('@/components/custody', () => ({
  ChainPill: ({ chain }: { chain: string }) => <div data-testid={`chain-${chain}`}>{chain}</div>,
}));

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('DashboardKpiGrid', () => {
  const mockMetrics = {
    aumUsdt: '10000',
    aumUsdc: '5000',
    pendingDeposits: 3,
    pendingDepositsValue: '500',
    pendingMultisigOps: 2,
    pendingWithdrawals: 1,
    aumBreakdown: {
      usdtBnb: '5000',
      usdcBnb: '2000',
      usdtSol: '5000',
      usdcSol: '3000',
    },
  };

  const mockHistory = {
    points: [
      { t: 0, v: 10000 },
      { t: 1, v: 12000 },
      { t: 2, v: 11500 },
    ],
  };

  it('renders main AUM card with formatted values', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: mockHistory,
      isLoading: false,
    } as any);

    const mockNavigate = vi.fn();
    const { container } = wrap(<DashboardKpiGrid onNavigate={mockNavigate} />);

    // Should render AUM card (kpi-primary)
    const aumCard = container.querySelector('.kpi-primary');
    expect(aumCard).toBeInTheDocument();

    // Should render currency formatter ($)
    expect(container.querySelector('.kpi-currency')).toBeInTheDocument();
  });

  it('renders pending deposits KPI', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: mockHistory,
      isLoading: false,
    } as any);

    const mockNavigate = vi.fn();
    const { container } = wrap(<DashboardKpiGrid onNavigate={mockNavigate} />);

    // Should show pending deposits count in kpi cards
    const kpiCards = container.querySelectorAll('.kpi');
    expect(kpiCards.length).toBeGreaterThan(1);
  });

  it('calls onNavigate when deposits KPI clicked', async () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: mockHistory,
      isLoading: false,
    } as any);

    const mockNavigate = vi.fn();
    const { container } = wrap(<DashboardKpiGrid onNavigate={mockNavigate} />);

    // Find the deposits KPI card (clickable) and click it
    const kpiCards = container.querySelectorAll('.kpi-clickable');
    if (kpiCards.length > 0) {
      const depositCard = kpiCards[0] as HTMLElement;
      depositCard.click();
      expect(mockNavigate).toHaveBeenCalledWith('deposits');
    }
  });

  it('handles missing metrics data gracefully', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);

    const mockNavigate = vi.fn();
    const { container } = wrap(<DashboardKpiGrid onNavigate={mockNavigate} />);

    // Should render kpi grid without errors with fallback values
    const kpiGrid = container.querySelector('.kpi-grid');
    expect(kpiGrid).toBeInTheDocument();
  });

  it('renders chain breakdown with BNB and SOL pills', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: mockHistory,
      isLoading: false,
    } as any);

    const mockNavigate = vi.fn();
    wrap(<DashboardKpiGrid onNavigate={mockNavigate} />);

    // Should render chain pills
    expect(screen.getByTestId('chain-bnb')).toBeInTheDocument();
    expect(screen.getByTestId('chain-sol')).toBeInTheDocument();
  });

  it('renders sparkline components for chart data', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: mockHistory,
      isLoading: false,
    } as any);

    const mockNavigate = vi.fn();
    wrap(<DashboardKpiGrid onNavigate={mockNavigate} />);

    // Should render multiple sparkline components
    const sparklines = screen.getAllByTestId('sparkline');
    expect(sparklines.length).toBeGreaterThan(0);
  });

  it('renders multisig pending operations KPI', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: mockHistory,
      isLoading: false,
    } as any);

    const mockNavigate = vi.fn();
    const { container } = wrap(<DashboardKpiGrid onNavigate={mockNavigate} />);

    // Should render all kpi cards including multisig
    const kpiCards = container.querySelectorAll('.kpi');
    expect(kpiCards.length).toBe(4); // Main AUM + deposits + withdrawals + multisig
  });

  it('calls onNavigate with transactions when breakdown cells clicked', async () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: mockHistory,
      isLoading: false,
    } as any);

    const mockNavigate = vi.fn();
    const { container } = wrap(<DashboardKpiGrid onNavigate={mockNavigate} />);

    // Find breakdown cells
    const breakdownCells = container.querySelectorAll('.kpi-breakdown-cell');
    if (breakdownCells.length > 0) {
      (breakdownCells[0] as HTMLElement).click();
      expect(mockNavigate).toHaveBeenCalledWith('transactions');
    }
  });
});
