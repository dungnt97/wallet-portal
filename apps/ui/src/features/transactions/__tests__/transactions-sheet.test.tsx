// Tests for features/transactions/transactions-sheet.tsx — tx detail slide-in panel.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/components/custody', () => ({
  ChainPill: ({ chain }: { chain: string }) => (
    <span data-testid={`chain-pill-${chain}`}>{chain}</span>
  ),
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid={`status-badge-${status}`}>{status}</span>
  ),
  TokenPill: ({ token, amount }: { token: string; amount: number }) => (
    <span data-testid="token-pill">{`${token}:${amount}`}</span>
  ),
}));

vi.mock('@/components/overlays', () => ({
  DetailSheet: ({
    open,
    onClose,
    title,
    subtitle,
    badges,
    footer,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    badges?: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="detail-sheet">
        <h2>{title}</h2>
        {subtitle && <p data-testid="subtitle">{subtitle}</p>}
        {badges && <div data-testid="badges">{badges}</div>}
        <div data-testid="footer">{footer}</div>
        <button type="button" data-testid="sheet-close" onClick={onClose}>
          close
        </button>
        {children}
      </div>
    ) : null,
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

vi.mock('@/lib/constants', () => ({
  CHAINS: {
    bnb: { name: 'BNB Chain', short: 'BSC' },
    sol: { name: 'Solana', short: 'SOL' },
  },
}));

vi.mock('@/lib/format', () => ({
  fmtDateTime: (iso: string) => `fmt:${iso}`,
}));

vi.mock('@/features/_shared/helpers', () => ({
  explorerUrl: (_chain: string, hash: string) => `https://explorer.example.com/tx/${hash}`,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import type { TxRow } from '@/api/queries';
import { TransactionSheet } from '../transactions-sheet';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<TxRow> = {}): TxRow {
  return {
    id: 'tx-abc-123',
    type: 'withdrawal',
    chain: 'bnb',
    token: 'USDT',
    amount: 500,
    from: '0xfrom1234',
    to: '0xto5678',
    txHash: '0xhash9abc',
    blockNumber: 12_345_678,
    status: 'confirmed',
    fee: 0.0021,
    timestamp: '2024-01-01T10:00:00Z',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TransactionSheet', () => {
  it('renders nothing when tx is null', () => {
    render(<TransactionSheet tx={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId('detail-sheet')).not.toBeInTheDocument();
  });

  it('renders detail sheet when tx is provided', () => {
    render(<TransactionSheet tx={makeTx()} onClose={vi.fn()} />);
    expect(screen.getByTestId('detail-sheet')).toBeInTheDocument();
  });

  it('shows transaction id in title', () => {
    render(<TransactionSheet tx={makeTx()} onClose={vi.fn()} />);
    expect(screen.getByText('Transaction tx-abc-123')).toBeInTheDocument();
  });

  it('shows type and chain short in subtitle', () => {
    render(<TransactionSheet tx={makeTx()} onClose={vi.fn()} />);
    expect(screen.getByTestId('subtitle').textContent).toBe('withdrawal · BSC');
  });

  it('shows status badge', () => {
    render(<TransactionSheet tx={makeTx()} onClose={vi.fn()} />);
    // StatusBadge rendered in both badges slot and dl (two instances)
    expect(screen.getAllByTestId('status-badge-confirmed').length).toBeGreaterThanOrEqual(1);
  });

  it('shows chain pill', () => {
    render(<TransactionSheet tx={makeTx()} onClose={vi.fn()} />);
    expect(screen.getByTestId('chain-pill-bnb')).toBeInTheDocument();
  });

  it('shows token pill with amount', () => {
    render(<TransactionSheet tx={makeTx()} onClose={vi.fn()} />);
    expect(screen.getByTestId('token-pill').textContent).toBe('USDT:500');
  });

  it('shows from address', () => {
    render(<TransactionSheet tx={makeTx()} onClose={vi.fn()} />);
    expect(screen.getByText('0xfrom1234')).toBeInTheDocument();
  });

  it('shows dash when from is empty', () => {
    render(<TransactionSheet tx={makeTx({ from: '' })} onClose={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows to address', () => {
    render(<TransactionSheet tx={makeTx()} onClose={vi.fn()} />);
    expect(screen.getByText('0xto5678')).toBeInTheDocument();
  });

  it('shows tx hash', () => {
    render(<TransactionSheet tx={makeTx()} onClose={vi.fn()} />);
    expect(screen.getByText('0xhash9abc')).toBeInTheDocument();
  });

  it('shows block number formatted with locale', () => {
    render(<TransactionSheet tx={makeTx()} onClose={vi.fn()} />);
    expect(screen.getByText('12,345,678')).toBeInTheDocument();
  });

  it('shows dash for null block number', () => {
    render(
      <TransactionSheet tx={makeTx({ blockNumber: null as unknown as number })} onClose={vi.fn()} />
    );
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('shows BNB fee for bnb chain with 4 decimal places', () => {
    render(<TransactionSheet tx={makeTx({ chain: 'bnb', fee: 0.0021 })} onClose={vi.fn()} />);
    expect(screen.getByText('0.0021 BNB')).toBeInTheDocument();
  });

  it('shows SOL fee for sol chain with 6 decimal places', () => {
    render(<TransactionSheet tx={makeTx({ chain: 'sol', fee: 0.000025 })} onClose={vi.fn()} />);
    expect(screen.getByText('0.000025 SOL')).toBeInTheDocument();
  });

  it('shows dash when fee is 0', () => {
    render(<TransactionSheet tx={makeTx({ fee: 0 })} onClose={vi.fn()} />);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('shows formatted timestamp', () => {
    render(<TransactionSheet tx={makeTx()} onClose={vi.fn()} />);
    expect(screen.getByText('fmt:2024-01-01T10:00:00Z')).toBeInTheDocument();
  });

  it('renders explorer link in footer', () => {
    render(<TransactionSheet tx={makeTx()} onClose={vi.fn()} />);
    const link = screen.getByText('View on explorer').closest('a') as HTMLAnchorElement;
    expect(link.href).toBe('https://explorer.example.com/tx/0xhash9abc');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TransactionSheet tx={makeTx()} onClose={onClose} />);
    await user.click(screen.getByText('Close').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
