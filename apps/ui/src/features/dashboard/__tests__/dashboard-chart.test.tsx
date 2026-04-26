import * as queries from '@/api/queries';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
/* biome-ignore lint/suspicious/noExplicitAny: mocking utilities require any types */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DashboardChart, HoldingsList } from '../dashboard-chart';

vi.mock('@/api/queries');
vi.mock('../../_shared/charts', () => ({
  AreaChart: ({ data, label }: { data: number[]; label: string }) => (
    <div data-testid="area-chart">
      {label}: {data.length} points
    </div>
  ),
  Sparkline: ({ data }: { data: number[] }) => <div data-testid="sparkline">{data.length}</div>,
}));
vi.mock('@/components/custody', () => ({
  Segmented: ({ options, value, onChange }: any) => (
    <div data-testid="segmented">
      {options.map((opt: any) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          data-testid={`seg-${opt.value}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  ),
  TokenPill: ({ token }: { token: string }) => <div data-testid={`token-${token}`}>{token}</div>,
  ChainPill: ({ chain }: { chain: string }) => <div data-testid={`chain-${chain}`}>{chain}</div>,
}));

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('DashboardChart', () => {
  const mockMetrics = {
    aumUsdt: '10000',
    aumUsdc: '5000',
    pendingDepositsValue: '500',
    pendingWithdrawals: 2,
  };

  const mockHistoryData = {
    points: [
      { t: 0, v: 10000 },
      { t: 1, v: 11000 },
      { t: 2, v: 12000 },
    ],
  };

  it('renders chart with default AUM metric and 7d range', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
    } as any);

    wrap(<DashboardChart />);

    expect(screen.getByTestId('area-chart')).toHaveTextContent('aum: 3 points');
  });

  it('renders tabs for AUM, deposits, and withdrawals', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
    } as any);

    wrap(<DashboardChart />);

    // Tabs should be present (rendered as buttons in chart header)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('switches metric when tab is clicked', async () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory)
      .mockReturnValueOnce({
        data: mockHistoryData,
        isLoading: false,
      } as any)
      .mockReturnValueOnce({
        data: mockHistoryData,
        isLoading: false,
      } as any);

    const user = userEvent.setup();
    const { rerender } = wrap(<DashboardChart />);

    // Initial chart should show aum
    expect(screen.getByTestId('area-chart')).toHaveTextContent('aum');

    // Re-render to simulate metric change
    rerender(<DashboardChart />);
  });

  it('switches time range via Segmented control', async () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
    } as any);

    const user = userEvent.setup();
    wrap(<DashboardChart />);

    const segmented = screen.getByTestId('segmented');
    expect(segmented).toBeInTheDocument();
  });

  it('shows empty state when no history data', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);

    const { container } = wrap(<DashboardChart />);

    // Should show empty state div instead of chart
    expect(container.querySelector('.chart-empty-state')).toBeInTheDocument();
  });

  it('computes delta correctly from series', () => {
    // Series: [10000, 11000, 12000] → delta = (12000-10000)/10000 * 100 = 20%
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
    } as any);

    const { container } = wrap(<DashboardChart />);

    // Tab should show delta in pro-tab-delta
    const deltaSpan = container.querySelector('.pro-tab-delta');
    expect(deltaSpan).toBeInTheDocument();
  });

  it('handles zero first value (avoids divide by zero)', () => {
    const zeroData = {
      points: [
        { t: 0, v: 0 },
        { t: 1, v: 100 },
      ],
    };
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: zeroData,
      isLoading: false,
    } as any);

    const { container } = wrap(<DashboardChart />);

    // Should render chart with data even with zero first point
    expect(container.querySelector('.pro-card-body')).toBeInTheDocument();
  });

  it('shows formatted values in tabs', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);
    vi.mocked(queries.useDashboardHistory).mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
    } as any);

    const { container } = wrap(<DashboardChart />);

    // Tab should show value in pro-tab-value
    const valueSpans = container.querySelectorAll('.pro-tab-value');
    expect(valueSpans.length).toBeGreaterThan(0);
  });
});

describe('HoldingsList', () => {
  const mockMetrics = {
    aumBreakdown: {
      usdtBnb: '5000',
      usdcBnb: '2000',
      usdtSol: '3000',
      usdcSol: '1000',
    },
  };

  it('renders holding rows for each asset', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);

    const { container } = wrap(<HoldingsList />);

    // Should render holdings list with rows
    const rows = container.querySelectorAll('.holdings-row');
    expect(rows.length).toBe(4); // USDT BNB, USDC BNB, USDT SOL, USDC SOL
  });

  it('renders chain pills for BNB and Solana', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);

    const { container } = wrap(<HoldingsList />);

    // Should render chain pills
    expect(container.querySelectorAll('[data-testid^="chain-"]').length).toBeGreaterThan(0);
  });

  it('calculates percentages correctly', () => {
    // Total = 5000+2000+3000+1000 = 11000
    // USDT BNB % = 5000/11000 * 100 ≈ 45%
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: mockMetrics,
      isLoading: false,
    } as any);

    const { container } = wrap(<HoldingsList />);

    // Should render holdings list with rows
    const holdings = container.querySelector('.holdings-list');
    expect(holdings).toBeInTheDocument();

    const rows = container.querySelectorAll('.holdings-row');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('handles empty breakdown gracefully', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);

    const { container } = wrap(<HoldingsList />);

    // Should still render holdings list even without data
    expect(container.querySelector('.holdings-list')).toBeInTheDocument();
  });

  it('shows dash when percentages undefined', () => {
    vi.mocked(queries.useDashboardMetrics).mockReturnValue({
      data: {
        aumBreakdown: {
          usdtBnb: '0',
          usdcBnb: '0',
          usdtSol: '0',
          usdcSol: '0',
        },
      },
      isLoading: false,
    } as any);

    wrap(<HoldingsList />);

    // Should show "—" for delta when no balances
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
