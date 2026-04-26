// Tests for features/sweep/sweep-address-table.tsx — SweepAddressTable + SweepCart.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('@/components/custody', () => ({
  Address: ({ value }: { value: string }) => <span data-testid="address">{value}</span>,
  DataTable: ({
    rows,
    columns,
    selectable,
    selectedIds,
    onToggleSelect,
    onToggleAll,
  }: {
    rows: unknown[];
    columns: { label: string; render: (r: unknown) => React.ReactNode }[];
    selectable?: boolean;
    selectedIds?: string[];
    onToggleSelect?: (id: string | number) => void;
    onToggleAll?: (next: boolean) => void;
  }) => (
    <div data-testid="data-table">
      <input
        type="checkbox"
        data-testid="toggle-all"
        onChange={(e) => onToggleAll?.(e.target.checked)}
      />
      {rows.map((r, i) => (
        <div key={i} data-testid={`row-${i}`}>
          {columns.map((col) => (
            <div key={col.label} data-testid={`cell-${col.label}`}>
              {col.render(r)}
            </div>
          ))}
          {selectable && (
            <input
              type="checkbox"
              data-testid={`row-check-${i}`}
              checked={(selectedIds ?? []).includes((r as { id: string }).id)}
              onChange={() => onToggleSelect?.((r as { id: string }).id)}
            />
          )}
        </div>
      ))}
    </div>
  ),
  Filter: ({ label }: { label: string }) => <div data-testid={`filter-${label}`}>{label}</div>,
}));

vi.mock('@/icons', () => ({
  I: new Proxy(
    {},
    {
      get:
        (_t, key) =>
        ({ size }: { size?: number }) => (
          <span data-testid={`icon-${String(key)}`} data-size={size} />
        ),
    }
  ),
}));

vi.mock('@/lib/format', () => ({
  fmtUSD: (n: number) => n.toFixed(2),
  shortHash: (hash: string, _a: number, _b: number) => `${hash.slice(0, 5)}…${hash.slice(-4)}`,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { SweepAddressTable, SweepCart } from '../sweep-address-table';
import type { FixSweepAddr } from '../sweep-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAddr(overrides: Partial<FixSweepAddr> = {}): FixSweepAddr {
  return {
    id: 'addr-1',
    userId: 'user-1',
    userName: 'Alice Smith',
    chain: 'bnb',
    address: '0xabcdef1234567890',
    balanceUSDT: 500,
    balanceUSDC: 200,
    gasBalance: 0.01,
    lastDepositAt: null,
    ...overrides,
  };
}

// ── SweepAddressTable tests ───────────────────────────────────────────────────

describe('SweepAddressTable', () => {
  const defaultProps = {
    chain: 'bnb' as const,
    selected: [],
    onToggle: vi.fn(),
    onToggleAll: vi.fn(),
    selectAboveThreshold: vi.fn(),
  };

  it('renders data table', () => {
    render(<SweepAddressTable rows={[]} {...defaultProps} />);
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  it('shows row count in toolbar', () => {
    render(<SweepAddressTable rows={[makeAddr(), makeAddr({ id: 'addr-2' })]} {...defaultProps} />);
    expect(screen.getByText(/sweep\.addressesWithBalance/)).toBeInTheDocument();
  });

  it('shows selectAboveThreshold button', () => {
    render(<SweepAddressTable rows={[]} {...defaultProps} />);
    expect(screen.getByText('sweep.selectAboveThreshold')).toBeInTheDocument();
  });

  it('calls selectAboveThreshold when button clicked', async () => {
    const selectAboveThreshold = vi.fn();
    const user = userEvent.setup();
    render(
      <SweepAddressTable rows={[]} {...defaultProps} selectAboveThreshold={selectAboveThreshold} />
    );
    await user.click(screen.getByText('sweep.selectAboveThreshold'));
    expect(selectAboveThreshold).toHaveBeenCalled();
  });

  it('shows user name in row', () => {
    render(<SweepAddressTable rows={[makeAddr()]} {...defaultProps} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows address in row', () => {
    render(<SweepAddressTable rows={[makeAddr()]} {...defaultProps} />);
    expect(screen.getByTestId('address').textContent).toBe('0xabcdef1234567890');
  });

  it('shows USDT balance', () => {
    render(<SweepAddressTable rows={[makeAddr({ balanceUSDT: 500 })]} {...defaultProps} />);
    expect(screen.getByText('500.00')).toBeInTheDocument();
  });

  it('shows USDC balance', () => {
    render(<SweepAddressTable rows={[makeAddr({ balanceUSDC: 200 })]} {...defaultProps} />);
    expect(screen.getByText('200.00')).toBeInTheDocument();
  });

  it('shows total balance (USDT + USDC)', () => {
    render(
      <SweepAddressTable
        rows={[makeAddr({ balanceUSDT: 500, balanceUSDC: 200 })]}
        {...defaultProps}
      />
    );
    expect(screen.getByText('$700.00')).toBeInTheDocument();
  });

  it('shows BNB gas header for bnb chain', () => {
    render(<SweepAddressTable rows={[makeAddr()]} {...defaultProps} chain="bnb" />);
    expect(screen.getByTestId('cell-sweep.cGasBnb')).toBeInTheDocument();
  });

  it('shows SOL gas header for sol chain', () => {
    render(<SweepAddressTable rows={[makeAddr({ chain: 'sol' })]} {...defaultProps} chain="sol" />);
    expect(screen.getByTestId('cell-sweep.cGasSol')).toBeInTheDocument();
  });

  it('shows dash when lastDepositAt is null', () => {
    render(<SweepAddressTable rows={[makeAddr({ lastDepositAt: null })]} {...defaultProps} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows time ago when lastDepositAt is set', () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    render(<SweepAddressTable rows={[makeAddr({ lastDepositAt: recent })]} {...defaultProps} />);
    expect(screen.getByText(/m ago/)).toBeInTheDocument();
  });

  it('calls onToggle when row checkbox clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<SweepAddressTable rows={[makeAddr()]} {...defaultProps} onToggle={onToggle} />);
    await user.click(screen.getByTestId('row-check-0'));
    expect(onToggle).toHaveBeenCalledWith('addr-1');
  });

  it('calls onToggleAll when header checkbox clicked', async () => {
    const onToggleAll = vi.fn();
    const user = userEvent.setup();
    render(<SweepAddressTable rows={[makeAddr()]} {...defaultProps} onToggleAll={onToggleAll} />);
    await user.click(screen.getByTestId('toggle-all'));
    expect(onToggleAll).toHaveBeenCalled();
  });
});

// ── SweepCart tests ───────────────────────────────────────────────────────────

describe('SweepCart', () => {
  const defaultProps = {
    selected: [] as FixSweepAddr[],
    totalUSDT: 0,
    totalUSDC: 0,
    total: 0,
    estFee: 0.0021,
    chain: 'bnb' as const,
    onExecute: vi.fn(),
  };

  it('shows cart title', () => {
    render(<SweepCart {...defaultProps} />);
    expect(screen.getByText('sweep.cartTitle')).toBeInTheDocument();
  });

  it('shows selected count badge', () => {
    render(<SweepCart {...defaultProps} />);
    expect(screen.getByText(/sweep\.cartSelected/)).toBeInTheDocument();
  });

  it('shows empty cart message when no items', () => {
    render(<SweepCart {...defaultProps} />);
    expect(screen.getByText('sweep.cartEmpty')).toBeInTheDocument();
  });

  it('shows cart items when selected', () => {
    render(
      <SweepCart
        {...defaultProps}
        selected={[makeAddr(), makeAddr({ id: 'addr-2', address: '0xsecond1234567890' })]}
        totalUSDT={1000}
        totalUSDC={400}
        total={1400}
      />
    );
    // Address hash appears
    expect(screen.getByText('sweep.cartUsdtSub')).toBeInTheDocument();
  });

  it('shows USDT subtotal', () => {
    render(<SweepCart {...defaultProps} totalUSDT={800} />);
    expect(screen.getByText('sweep.cartUsdtSub')).toBeInTheDocument();
  });

  it('shows USDC subtotal', () => {
    render(<SweepCart {...defaultProps} totalUSDC={300} />);
    expect(screen.getByText('sweep.cartUsdcSub')).toBeInTheDocument();
  });

  it('shows total', () => {
    render(<SweepCart {...defaultProps} total={1100} />);
    expect(screen.getByText('sweep.cartTotal')).toBeInTheDocument();
    expect(screen.getByText('$1100.00')).toBeInTheDocument();
  });

  it('shows BNB fee for bnb chain', () => {
    render(<SweepCart {...defaultProps} chain="bnb" estFee={0.0021} />);
    expect(screen.getByText('0.0021 BNB')).toBeInTheDocument();
  });

  it('shows SOL fee for sol chain with 6 decimal places', () => {
    render(<SweepCart {...defaultProps} chain="sol" estFee={0.000025} />);
    expect(screen.getByText('0.000025 SOL')).toBeInTheDocument();
  });

  it('disables execute button when no items selected', () => {
    render(<SweepCart {...defaultProps} selected={[]} />);
    expect(screen.getByText('sweep.reviewExecute').closest('button')).toBeDisabled();
  });

  it('enables execute button when items selected', () => {
    render(<SweepCart {...defaultProps} selected={[makeAddr()]} />);
    expect(screen.getByText('sweep.reviewExecute').closest('button')).not.toBeDisabled();
  });

  it('calls onExecute when execute button clicked', async () => {
    const onExecute = vi.fn();
    const user = userEvent.setup();
    render(<SweepCart {...defaultProps} selected={[makeAddr()]} onExecute={onExecute} />);
    await user.click(screen.getByText('sweep.reviewExecute').closest('button') as HTMLElement);
    expect(onExecute).toHaveBeenCalled();
  });

  it('shows more indicator when more than 6 items', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      makeAddr({ id: `addr-${i}`, address: `0xaddr${i}` })
    );
    render(<SweepCart {...defaultProps} selected={items} />);
    expect(screen.getByText(/sweep\.cartMore/)).toBeInTheDocument();
  });
});
