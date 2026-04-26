import type { TxRow } from '@/api/queries';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionsTable } from '../transactions-table';

vi.mock('@/components/custody', () => ({
  Address: ({ value }: { value: string }) => <span data-testid="address">{value}</span>,
  ChainPill: ({ chain }: { chain: string }) => <span data-testid={`chain-${chain}`}>{chain}</span>,
  Hash: ({ value }: { value: string }) => <span data-testid="hash">{value}</span>,
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

vi.mock('@/icons', () => ({
  I: {
    ArrowDown: () => <span data-testid="icon-arrow-down" />,
    ArrowUp: () => <span data-testid="icon-arrow-up" />,
    Sweep: () => <span data-testid="icon-sweep" />,
    ChevronLeft: () => <span />,
    ChevronRight: () => <span />,
  },
}));

const defaultProps = {
  page: 1,
  totalPages: 3,
  total: 25,
  pageSize: 10,
  onSelect: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
};

function makeTx(overrides: Partial<TxRow> = {}): TxRow {
  return {
    id: 'tx-1',
    type: 'deposit',
    chain: 'bnb',
    token: 'USDT',
    amount: 500,
    from: '0xFROM',
    to: '0xTO',
    txHash: '0xHASH',
    blockNumber: 1234,
    status: 'confirmed',
    fee: 0.0012,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('TransactionsTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders empty state when no rows', () => {
    render(<TransactionsTable {...defaultProps} rows={[]} />);
    expect(document.querySelector('.table-empty-title')).toHaveTextContent('No transactions');
  });

  it('renders chain pill', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx()]} />);
    expect(screen.getByTestId('chain-bnb')).toBeInTheDocument();
  });

  it('renders token pill', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx()]} />);
    expect(screen.getByTestId('token-USDT')).toBeInTheDocument();
  });

  it('renders amount', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx({ amount: 500 })]} />);
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('renders deposit arrow-down icon', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx({ type: 'deposit' })]} />);
    expect(screen.getByTestId('icon-arrow-down')).toBeInTheDocument();
  });

  it('renders withdrawal arrow-up icon', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx({ type: 'withdrawal' })]} />);
    expect(screen.getByTestId('icon-arrow-up')).toBeInTheDocument();
  });

  it('renders sweep icon for sweep type', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx({ type: 'sweep' })]} />);
    expect(screen.getByTestId('icon-sweep')).toBeInTheDocument();
  });

  it('renders from address', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx({ from: '0xFROM' })]} />);
    const addresses = screen.getAllByTestId('address');
    expect(addresses[0]).toHaveTextContent('0xFROM');
  });

  it('renders dash for missing from address', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx({ from: '—' })]} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders hash', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx()]} />);
    expect(screen.getByTestId('hash')).toHaveTextContent('0xHASH');
  });

  it('renders block number', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx({ blockNumber: 1234 })]} />);
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx({ status: 'confirmed' })]} />);
    expect(screen.getByTestId('status-confirmed')).toBeInTheDocument();
  });

  it('renders fee for bnb (4 decimals)', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx({ chain: 'bnb', fee: 0.0012 })]} />);
    expect(screen.getByText('0.0012')).toBeInTheDocument();
  });

  it('renders dash for zero fee', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx({ fee: 0 })]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders LiveTimeAgo', () => {
    render(<TransactionsTable {...defaultProps} rows={[makeTx()]} />);
    expect(screen.getByTestId('live-time-ago')).toBeInTheDocument();
  });

  it('calls onSelect when row clicked', () => {
    const onSelect = vi.fn();
    const tx = makeTx();
    render(<TransactionsTable {...defaultProps} rows={[tx]} onSelect={onSelect} />);
    fireEvent.click(document.querySelector('tbody tr') as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(tx);
  });

  it('renders pagination showing range', () => {
    render(
      <TransactionsTable {...defaultProps} rows={[makeTx()]} page={1} pageSize={10} total={25} />
    );
    expect(screen.getByText(/Showing 1–10 of 25/)).toBeInTheDocument();
  });

  it('prev button disabled on page 1', () => {
    render(<TransactionsTable {...defaultProps} rows={[]} page={1} totalPages={3} />);
    const buttons = document.querySelectorAll(
      '.pagination button'
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].disabled).toBe(true);
  });

  it('next button disabled on last page', () => {
    render(<TransactionsTable {...defaultProps} rows={[]} page={3} totalPages={3} />);
    const buttons = document.querySelectorAll(
      '.pagination button'
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons[1].disabled).toBe(true);
  });

  it('calls onPrev when prev clicked', () => {
    const onPrev = vi.fn();
    render(
      <TransactionsTable {...defaultProps} rows={[]} page={2} totalPages={3} onPrev={onPrev} />
    );
    const buttons = document.querySelectorAll('.pagination button');
    fireEvent.click(buttons[0]);
    expect(onPrev).toHaveBeenCalled();
  });

  it('calls onNext when next clicked', () => {
    const onNext = vi.fn();
    render(
      <TransactionsTable {...defaultProps} rows={[]} page={1} totalPages={3} onNext={onNext} />
    );
    const buttons = document.querySelectorAll('.pagination button');
    fireEvent.click(buttons[1]);
    expect(onNext).toHaveBeenCalled();
  });
});
