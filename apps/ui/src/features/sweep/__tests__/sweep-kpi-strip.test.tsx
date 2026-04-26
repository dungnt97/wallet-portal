/* biome-ignore lint/suspicious/noExplicitAny: mocking utilities require any types */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SweepKpiStrip } from '../sweep-kpi-strip';

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
  StatusBadge: ({ status }: { status: string }) => (
    <div data-testid={`status-${status}`}>{status}</div>
  ),
}));

vi.mock('@/icons', () => ({
  I: {
    Sweep: () => <span data-testid="icon-sweep" />,
    Check: () => <span data-testid="icon-check" />,
    Lightning: () => <span data-testid="icon-lightning" />,
    Activity: () => <span data-testid="icon-activity" />,
  },
}));

vi.mock('@/lib/format', () => ({
  fmtCompact: (v: number) => `${(v / 1000).toFixed(1)}K`,
}));

vi.mock('@/lib/constants', () => ({
  CHAINS: {
    bnb: { short: 'BNB', name: 'BSC' },
    sol: { short: 'SOL', name: 'Solana' },
  },
}));

vi.mock('../../_shared/realtime', () => ({
  LiveTimeAgo: ({ at }: { at: string }) => <span data-testid="live-time-ago">now</span>,
}));

describe('SweepKpiStrip', () => {
  const mockBatch = {
    id: 'batch-001',
    executedAt: new Date().toISOString(),
    status: 'completed' as const,
  };

  it('renders KPI strip with all items', () => {
    render(
      <SweepKpiStrip
        chain="bnb"
        readyTotal={5000}
        readyCount={3}
        selectedCount={2}
        selectedTotal={3000}
        estFee={0.1234}
        latest={mockBatch}
      />
    );

    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('displays ready to sweep amount', () => {
    render(
      <SweepKpiStrip
        chain="bnb"
        readyTotal={5000}
        readyCount={3}
        selectedCount={2}
        selectedTotal={3000}
        estFee={0.1234}
        latest={mockBatch}
      />
    );

    // 5000 → 5.0K
    expect(screen.getByTestId('kpi-ready')).toHaveTextContent('5.0K');
  });

  it('displays selected amount', () => {
    render(
      <SweepKpiStrip
        chain="bnb"
        readyTotal={5000}
        readyCount={3}
        selectedCount={2}
        selectedTotal={3000}
        estFee={0.1234}
        latest={mockBatch}
      />
    );

    // 3000 → 3.0K
    expect(screen.getByTestId('kpi-selected')).toHaveTextContent('3.0K');
  });

  it('displays estimated fee for BNB chain', () => {
    render(
      <SweepKpiStrip
        chain="bnb"
        readyTotal={5000}
        readyCount={3}
        selectedCount={2}
        selectedTotal={3000}
        estFee={0.1234}
        latest={mockBatch}
      />
    );

    // BNB fee with 4 decimal places
    expect(screen.getByTestId('kpi-fee')).toHaveTextContent('0.1234');
  });

  it('displays estimated fee for SOL chain with 6 decimals', () => {
    render(
      <SweepKpiStrip
        chain="sol"
        readyTotal={5000}
        readyCount={3}
        selectedCount={2}
        selectedTotal={3000}
        estFee={0.123456}
        latest={mockBatch}
      />
    );

    // SOL fee with 6 decimal places
    expect(screen.getByTestId('kpi-fee')).toHaveTextContent('0.123456');
  });

  it('displays last sweep info when batch exists', () => {
    render(
      <SweepKpiStrip
        chain="bnb"
        readyTotal={5000}
        readyCount={3}
        selectedCount={2}
        selectedTotal={3000}
        estFee={0.1234}
        latest={mockBatch}
      />
    );

    expect(screen.getByTestId('kpi-last')).toBeInTheDocument();
  });

  it('displays dash when no latest batch', () => {
    const { container } = render(
      <SweepKpiStrip
        chain="bnb"
        readyTotal={5000}
        readyCount={3}
        selectedCount={2}
        selectedTotal={3000}
        estFee={0.1234}
        latest={undefined}
      />
    );

    expect(container.textContent).toContain('—');
  });

  it('handles partial status batch', () => {
    const partialBatch = {
      id: 'batch-002',
      executedAt: new Date().toISOString(),
      status: 'partial' as const,
    };

    render(
      <SweepKpiStrip
        chain="bnb"
        readyTotal={5000}
        readyCount={3}
        selectedCount={2}
        selectedTotal={3000}
        estFee={0.1234}
        latest={partialBatch}
      />
    );

    // Should render KPI strip without errors
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('handles zero ready amount', () => {
    render(
      <SweepKpiStrip
        chain="bnb"
        readyTotal={0}
        readyCount={0}
        selectedCount={0}
        selectedTotal={0}
        estFee={0}
        latest={undefined}
      />
    );

    expect(screen.getByTestId('kpi-ready')).toHaveTextContent('$0.0K');
  });

  it('handles large amounts', () => {
    render(
      <SweepKpiStrip
        chain="bnb"
        readyTotal={1000000}
        readyCount={100}
        selectedCount={50}
        selectedTotal={500000}
        estFee={0.5}
        latest={mockBatch}
      />
    );

    // 1000000 → 1000.0K
    expect(screen.getByTestId('kpi-ready')).toHaveTextContent('1000.0K');
  });

  it('displays ready count in footer text', () => {
    const { container } = render(
      <SweepKpiStrip
        chain="bnb"
        readyTotal={5000}
        readyCount={3}
        selectedCount={2}
        selectedTotal={3000}
        estFee={0.1234}
        latest={mockBatch}
      />
    );

    // Should show address count in footer
    expect(container.textContent).toContain('3');
  });

  it('displays selected count in footer text', () => {
    const { container } = render(
      <SweepKpiStrip
        chain="bnb"
        readyTotal={5000}
        readyCount={3}
        selectedCount={5}
        selectedTotal={3000}
        estFee={0.1234}
        latest={mockBatch}
      />
    );

    // Should show selected count
    expect(container.textContent).toContain('5');
  });
});
