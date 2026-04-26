import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WithdrawalRow } from '../withdrawal-types';
import { WithdrawalsKpiStrip } from '../withdrawals-kpi-strip';

// ── Mocks ─────────────────────────────────────────────────────────────────────

type KpiItem = { key: string; value: unknown };

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
}));

vi.mock('@/icons', () => ({
  I: {
    Clock: () => <span data-testid="icon-clock" />,
    Check: () => <span data-testid="icon-check" />,
    Lightning: () => <span data-testid="icon-lightning" />,
    UserX: () => <span data-testid="icon-userx" />,
  },
}));

vi.mock('@/lib/format', () => ({
  fmtCompact: (v: number) => `${(v / 1000).toFixed(1)}K`,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<WithdrawalRow> = {}): WithdrawalRow {
  return {
    id: 'wd-001',
    chain: 'bnb',
    token: 'USDT',
    amount: 10_000,
    destination: '0xDest',
    stage: 'awaiting_signatures',
    risk: 'low',
    createdAt: new Date().toISOString(),
    requestedBy: 'user-1',
    multisig: { required: 2, total: 3, collected: 0, approvers: [], rejectedBy: null },
    txHash: null,
    note: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WithdrawalsKpiStrip', () => {
  it('renders KPI strip', () => {
    render(<WithdrawalsKpiStrip list={[]} />);
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('renders all 4 KPI items', () => {
    render(<WithdrawalsKpiStrip list={[]} />);
    expect(screen.getByTestId('kpi-awaiting')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-completed')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-turnaround')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-failed')).toBeInTheDocument();
  });

  it('calculates awaiting value correctly', () => {
    const list = [
      makeRow({ stage: 'awaiting_signatures', amount: 5_000 }),
      makeRow({ id: 'wd-002', stage: 'awaiting_signatures', amount: 3_000 }),
    ];
    render(<WithdrawalsKpiStrip list={list} />);
    expect(screen.getByTestId('kpi-awaiting')).toHaveTextContent('8.0K');
  });

  it('shows $0.0K awaiting when no awaiting withdrawals', () => {
    const list = [makeRow({ stage: 'completed' })];
    render(<WithdrawalsKpiStrip list={list} />);
    expect(screen.getByTestId('kpi-awaiting')).toHaveTextContent('0.0K');
  });

  it('calculates completed value correctly', () => {
    const list = [
      makeRow({ stage: 'completed', amount: 2_000 }),
      makeRow({ id: 'wd-002', stage: 'completed', amount: 3_000 }),
    ];
    render(<WithdrawalsKpiStrip list={list} />);
    expect(screen.getByTestId('kpi-completed')).toHaveTextContent('5.0K');
  });

  it('shows 0 failed when no failed/cancelled', () => {
    const list = [makeRow({ stage: 'awaiting_signatures' })];
    render(<WithdrawalsKpiStrip list={list} />);
    expect(screen.getByTestId('kpi-failed')).toHaveTextContent('0');
  });

  it('counts both failed and cancelled in failed KPI', () => {
    const list = [
      makeRow({ stage: 'failed' }),
      makeRow({ id: 'wd-002', stage: 'cancelled' }),
      makeRow({ id: 'wd-003', stage: 'completed' }),
    ];
    render(<WithdrawalsKpiStrip list={list} />);
    expect(screen.getByTestId('kpi-failed')).toHaveTextContent('2');
  });

  it('turnaround shows dash placeholder', () => {
    render(<WithdrawalsKpiStrip list={[]} />);
    expect(screen.getByTestId('kpi-turnaround')).toHaveTextContent('—');
  });

  it('handles empty list gracefully', () => {
    render(<WithdrawalsKpiStrip list={[]} />);
    expect(screen.getByTestId('kpi-awaiting')).toHaveTextContent('0.0K');
    expect(screen.getByTestId('kpi-completed')).toHaveTextContent('0.0K');
    expect(screen.getByTestId('kpi-failed')).toHaveTextContent('0');
  });

  it('does not count executing/broadcast as failed', () => {
    const list = [makeRow({ stage: 'executing' }), makeRow({ id: 'wd-002', stage: 'broadcast' })];
    render(<WithdrawalsKpiStrip list={list} />);
    expect(screen.getByTestId('kpi-failed')).toHaveTextContent('0');
  });

  it('does not count awaiting_signatures in completed total', () => {
    const list = [makeRow({ stage: 'awaiting_signatures', amount: 99_000 })];
    render(<WithdrawalsKpiStrip list={list} />);
    expect(screen.getByTestId('kpi-completed')).toHaveTextContent('0.0K');
  });
});
