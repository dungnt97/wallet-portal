import type { TxRow } from '@/api/queries';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionsKpiStrip } from '../transactions-kpi-strip';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/queries', () => ({
  useDashboardHistory: vi.fn(() => ({ data: { points: [] } })),
}));

vi.mock('@/components/custody', () => ({
  KpiStrip: ({ items }: { items: { key: string; value: unknown }[] }) => (
    <div data-testid="kpi-strip">
      {items.map((item) => (
        <div key={item.key} data-testid={`kpi-${item.key}`}>
          {item.value as string}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/icons', () => ({
  I: {
    Activity: () => <span />,
    ArrowDown: () => <span />,
    ArrowUp: () => <span />,
    Lightning: () => <span />,
  },
}));

vi.mock('@/lib/format', () => ({
  fmtCompact: (v: number) => `${(v / 1000).toFixed(1)}K`,
}));

vi.mock('../_shared/charts', () => ({
  Sparkline: () => <span data-testid="sparkline" />,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<TxRow> = {}): TxRow {
  return {
    id: 'tx-1',
    type: 'deposit',
    chain: 'bnb',
    token: 'USDT',
    amount: 1000,
    fee: 0.001,
    from: '0xFrom',
    to: '0xTo',
    status: 'confirmed',
    txHash: '0xhash',
    blockNumber: 1000,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TransactionsKpiStrip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders KPI strip', () => {
    render(<TransactionsKpiStrip rows={[]} />);
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('renders all 4 KPI items', () => {
    render(<TransactionsKpiStrip rows={[]} />);
    expect(screen.getByTestId('kpi-volume')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-deposits')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-withdrawals')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-gas')).toBeInTheDocument();
  });

  it('shows 0.0K volume for empty rows', () => {
    render(<TransactionsKpiStrip rows={[]} />);
    expect(screen.getByTestId('kpi-volume')).toHaveTextContent('0.0K');
  });

  it('calculates total volume correctly', () => {
    const rows = [makeRow({ amount: 5000 }), makeRow({ id: 'tx-2', amount: 3000 })];
    render(<TransactionsKpiStrip rows={rows} />);
    // 8000 → 8.0K
    expect(screen.getByTestId('kpi-volume')).toHaveTextContent('8.0K');
  });

  it('counts deposits', () => {
    const rows = [
      makeRow({ type: 'deposit' }),
      makeRow({ id: 'tx-2', type: 'deposit' }),
      makeRow({ id: 'tx-3', type: 'withdrawal' }),
    ];
    render(<TransactionsKpiStrip rows={rows} />);
    expect(screen.getByTestId('kpi-deposits')).toHaveTextContent('2');
  });

  it('counts withdrawals', () => {
    const rows = [makeRow({ type: 'withdrawal' }), makeRow({ id: 'tx-2', type: 'deposit' })];
    render(<TransactionsKpiStrip rows={rows} />);
    expect(screen.getByTestId('kpi-withdrawals')).toHaveTextContent('1');
  });

  it('shows 0 deposits for empty rows', () => {
    render(<TransactionsKpiStrip rows={[]} />);
    expect(screen.getByTestId('kpi-deposits')).toHaveTextContent('0');
  });

  it('shows gas spent as — when total fee is 0', () => {
    const rows = [makeRow({ fee: 0 })];
    render(<TransactionsKpiStrip rows={rows} />);
    expect(screen.getByTestId('kpi-gas')).toHaveTextContent('—');
  });

  it('shows gas total when fee > 0', () => {
    const rows = [makeRow({ fee: 0.001 }), makeRow({ id: 'tx-2', fee: 0.002 })];
    render(<TransactionsKpiStrip rows={rows} />);
    // 0.003 formatted to 3 decimals
    expect(screen.getByTestId('kpi-gas')).toHaveTextContent('0.003');
  });

  it('handles mixed types correctly', () => {
    const rows = [
      makeRow({ type: 'deposit', amount: 2000 }),
      makeRow({ id: 'tx-2', type: 'deposit', amount: 1000 }),
      makeRow({ id: 'tx-3', type: 'withdrawal', amount: 500 }),
    ];
    render(<TransactionsKpiStrip rows={rows} />);
    expect(screen.getByTestId('kpi-deposits')).toHaveTextContent('2');
    expect(screen.getByTestId('kpi-withdrawals')).toHaveTextContent('1');
    // Total volume: 3500 → 3.5K
    expect(screen.getByTestId('kpi-volume')).toHaveTextContent('3.5K');
  });
});
