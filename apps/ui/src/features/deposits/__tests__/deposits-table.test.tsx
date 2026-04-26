import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixDeposit } from '../deposit-types';
import { DepositsTable } from '../deposits-table';

vi.mock('zustand/middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand/middleware')>();
  // biome-ignore lint/suspicious/noExplicitAny: vitest middleware mock requires any
  return { ...actual, persist: (fn: any) => fn };
});

vi.mock('@/components/custody', () => ({
  Address: ({ value }: { value: string }) => <span data-testid="address">{value}</span>,
  ChainPill: ({ chain }: { chain: string }) => <span data-testid={`chain-${chain}`}>{chain}</span>,
  Hash: ({ value }: { value: string }) => <span data-testid="hash">{value}</span>,
  Risk: ({ level }: { level: string }) => <span data-testid={`risk-${level}`}>{level}</span>,
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid={`status-${status}`}>{status}</span>
  ),
  TokenPill: ({ token }: { token: string }) => <span data-testid={`token-${token}`}>{token}</span>,
}));

vi.mock('@/features/_shared/realtime', () => ({
  LiveTimeAgo: ({ at }: { at: string }) => <span data-testid="live-time-ago">{at}</span>,
}));

vi.mock('@/lib/format', () => ({
  fmtUSD: (v: number) => `$${v.toFixed(2)}`,
}));

function makeDeposit(overrides: Partial<FixDeposit> = {}): FixDeposit {
  return {
    id: 'd-1',
    userId: 'u-1',
    userName: 'Alice Chen',
    chain: 'bnb',
    token: 'USDT',
    amount: 500,
    status: 'credited',
    address: '0xABC',
    txHash: '0xHASH',
    confirmations: 10,
    requiredConfirmations: 10,
    detectedAt: new Date().toISOString(),
    creditedAt: new Date().toISOString(),
    sweptAt: null,
    risk: 'low',
    blockNumber: 1000,
    ...overrides,
  };
}

describe('DepositsTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders empty state when no rows', () => {
    render(<DepositsTable rows={[]} onSelect={vi.fn()} />);
    expect(document.querySelector('.table-empty-title')).toHaveTextContent('No deposits');
  });

  it('renders user name', () => {
    render(<DepositsTable rows={[makeDeposit()]} onSelect={vi.fn()} />);
    expect(screen.getByText('Alice Chen')).toBeInTheDocument();
  });

  it('renders chain pill', () => {
    render(<DepositsTable rows={[makeDeposit({ chain: 'bnb' })]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('chain-bnb')).toBeInTheDocument();
  });

  it('renders token pill', () => {
    render(<DepositsTable rows={[makeDeposit({ token: 'USDT' })]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('token-USDT')).toBeInTheDocument();
  });

  it('renders amount', () => {
    render(<DepositsTable rows={[makeDeposit({ amount: 500 })]} onSelect={vi.fn()} />);
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('renders address', () => {
    render(<DepositsTable rows={[makeDeposit({ address: '0xABC' })]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('address')).toHaveTextContent('0xABC');
  });

  it('renders tx hash', () => {
    render(<DepositsTable rows={[makeDeposit({ txHash: '0xHASH' })]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('hash')).toHaveTextContent('0xHASH');
  });

  it('renders status badge', () => {
    render(<DepositsTable rows={[makeDeposit({ status: 'credited' })]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('status-credited')).toBeInTheDocument();
  });

  it('renders risk when showRiskFlags=true (default)', () => {
    render(<DepositsTable rows={[makeDeposit({ risk: 'low' })]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('risk-low')).toBeInTheDocument();
  });

  it('renders LiveTimeAgo for detectedAt', () => {
    render(<DepositsTable rows={[makeDeposit()]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('live-time-ago')).toBeInTheDocument();
  });

  it('calls onSelect when row clicked', () => {
    const onSelect = vi.fn();
    const dep = makeDeposit();
    render(<DepositsTable rows={[dep]} onSelect={onSelect} />);
    fireEvent.click(document.querySelector('tbody tr') as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(dep);
  });

  it('renders confirmation progress for pending deposit', () => {
    render(
      <DepositsTable
        rows={[makeDeposit({ status: 'pending', confirmations: 5, requiredConfirmations: 10 })]}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('5/10')).toBeInTheDocument();
  });

  it('renders confirmed confs as n/n for non-pending deposit', () => {
    render(
      <DepositsTable
        rows={[makeDeposit({ status: 'credited', confirmations: 10, requiredConfirmations: 10 })]}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('10/10')).toBeInTheDocument();
  });

  it('renders multiple rows', () => {
    const dep2 = makeDeposit({ id: 'd-2', userName: 'Bob Smith' });
    render(<DepositsTable rows={[makeDeposit(), dep2]} onSelect={vi.fn()} />);
    expect(screen.getByText('Alice Chen')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('renders user initials avatar', () => {
    render(<DepositsTable rows={[makeDeposit({ userName: 'Alice Chen' })]} onSelect={vi.fn()} />);
    expect(screen.getByText('AC')).toBeInTheDocument();
  });
});
