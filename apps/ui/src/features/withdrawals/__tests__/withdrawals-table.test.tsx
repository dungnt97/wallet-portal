import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WithdrawalRow } from '../withdrawal-types';
import { WithdrawalsTable } from '../withdrawals-table';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/components/custody', () => ({
  Address: ({ value }: { value: string }) => <span data-testid="address">{value}</span>,
  ChainPill: ({ chain }: { chain: string }) => <span data-testid={`chain-${chain}`}>{chain}</span>,
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
  I: { Check: () => <span data-testid="check-icon" /> },
}));

function makeRow(overrides: Partial<WithdrawalRow> = {}): WithdrawalRow {
  return {
    id: 'wd-0000-1111-2222',
    chain: 'bnb',
    token: 'USDT',
    amount: 1000,
    destination: '0xDEST',
    stage: 'awaiting_signatures',
    risk: 'low',
    createdAt: new Date().toISOString(),
    requestedBy: 'staff-1',
    multisig: { required: 2, total: 3, collected: 1, approvers: [], rejectedBy: null },
    txHash: null,
    note: null,
    ...overrides,
  };
}

describe('WithdrawalsTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders empty state when no rows', () => {
    render(<WithdrawalsTable rows={[]} onSelect={vi.fn()} />);
    expect(document.querySelector('.table-empty-title')).toHaveTextContent(
      'withdrawals.emptyTitle'
    );
  });

  it('renders truncated id', () => {
    render(<WithdrawalsTable rows={[makeRow()]} onSelect={vi.fn()} />);
    expect(screen.getByText('wd-0000-1111…')).toBeInTheDocument();
  });

  it('renders token pill', () => {
    render(<WithdrawalsTable rows={[makeRow({ token: 'USDT' })]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('token-USDT')).toBeInTheDocument();
  });

  it('renders chain pill', () => {
    render(<WithdrawalsTable rows={[makeRow({ chain: 'bnb' })]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('chain-bnb')).toBeInTheDocument();
  });

  it('renders amount', () => {
    render(<WithdrawalsTable rows={[makeRow({ amount: 1000 })]} onSelect={vi.fn()} />);
    expect(screen.getByText('$1000.00')).toBeInTheDocument();
  });

  it('renders destination address', () => {
    render(<WithdrawalsTable rows={[makeRow({ destination: '0xDEST' })]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('address')).toHaveTextContent('0xDEST');
  });

  it('renders approval pips', () => {
    render(
      <WithdrawalsTable
        rows={[
          makeRow({
            multisig: { required: 2, total: 3, collected: 1, approvers: [], rejectedBy: null },
          }),
        ]}
        onSelect={vi.fn()}
      />
    );
    const pips = document.querySelectorAll('.approval-pip');
    expect(pips.length).toBe(3);
  });

  it('renders approval text', () => {
    render(
      <WithdrawalsTable
        rows={[
          makeRow({
            multisig: { required: 2, total: 3, collected: 1, approvers: [], rejectedBy: null },
          }),
        ]}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(
      <WithdrawalsTable rows={[makeRow({ stage: 'awaiting_signatures' })]} onSelect={vi.fn()} />
    );
    expect(screen.getByTestId('status-awaiting_signatures')).toBeInTheDocument();
  });

  it('renders LiveTimeAgo', () => {
    render(<WithdrawalsTable rows={[makeRow()]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('live-time-ago')).toBeInTheDocument();
  });

  it('calls onSelect when row clicked', () => {
    const onSelect = vi.fn();
    const row = makeRow();
    render(<WithdrawalsTable rows={[row]} onSelect={onSelect} />);
    fireEvent.click(document.querySelector('tbody tr') as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(row);
  });

  it('renders multiple rows', () => {
    const row2 = makeRow({ id: 'wd-aaaa-bbbb-cccc', amount: 200 });
    render(<WithdrawalsTable rows={[makeRow(), row2]} onSelect={vi.fn()} />);
    expect(screen.getByText('wd-aaaa-bbbb…')).toBeInTheDocument();
  });

  it('approved pip has approved class', () => {
    render(
      <WithdrawalsTable
        rows={[
          makeRow({
            multisig: { required: 2, total: 2, collected: 1, approvers: [], rejectedBy: null },
          }),
        ]}
        onSelect={vi.fn()}
      />
    );
    const pips = document.querySelectorAll('.approval-pip');
    expect(pips[0]).toHaveClass('approved');
    expect(pips[1]).toHaveClass('pending');
  });
});
