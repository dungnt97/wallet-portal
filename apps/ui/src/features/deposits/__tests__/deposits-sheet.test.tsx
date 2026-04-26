// Tests for features/deposits/deposits-sheet.tsx — deposit detail side-sheet.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ApiError';
    }
  },
}));

const mockAddToSweepMutation = { mutate: vi.fn(), isPending: false };
vi.mock('@/api/queries', () => ({
  useAddDepositToSweep: () => mockAddToSweepMutation,
}));

vi.mock('@/components/custody', () => ({
  ChainPill: ({ chain }: { chain: string }) => (
    <span data-testid={`chain-pill-${chain}`}>{chain}</span>
  ),
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid={`status-badge-${status}`}>{status}</span>
  ),
  TokenPill: ({ token }: { token: string }) => (
    <span data-testid={`token-pill-${token}`}>{token}</span>
  ),
  Risk: ({ level }: { level: string }) => <span data-testid={`risk-${level}`}>{level}</span>,
}));

vi.mock('@/components/overlays', () => ({
  DetailSheet: ({
    open,
    onClose,
    title,
    subtitle,
    footer,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="detail-sheet">
        <h2>{title}</h2>
        {subtitle && <p data-testid="subtitle">{subtitle}</p>}
        <div data-testid="footer">{footer}</div>
        <button type="button" data-testid="sheet-close" onClick={onClose}>
          close
        </button>
        {children}
      </div>
    ) : null,
  useToast: () => vi.fn(),
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
  fmtUSD: (n: number) => n.toFixed(2),
}));

vi.mock('@/stores/tweaks-store', () => ({
  useTweaksStore: (selector: (s: { showRiskFlags: boolean }) => unknown) =>
    selector({ showRiskFlags: false }),
}));

vi.mock('@/features/_shared/helpers', () => ({
  explorerUrl: (_chain: string, hash: string) => `https://explorer.example.com/tx/${hash}`,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import type { FixDeposit } from '../deposit-types';
import { DepositSheet } from '../deposits-sheet';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeposit(overrides: Partial<FixDeposit> = {}): FixDeposit {
  return {
    id: 'dep-001',
    userId: 'user-123',
    userName: 'Alice Smith',
    chain: 'bnb',
    token: 'USDT',
    amount: 1000,
    address: '0xabc123',
    txHash: '0xdeadbeef',
    blockNumber: 99_999_999,
    confirmations: 15,
    requiredConfirmations: 12,
    status: 'credited',
    risk: 'low',
    detectedAt: '2024-01-01T10:00:00Z',
    creditedAt: '2024-01-01T10:05:00Z',
    sweptAt: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DepositSheet', () => {
  beforeEach(() => {
    mockAddToSweepMutation.mutate = vi.fn();
    mockAddToSweepMutation.isPending = false;
  });

  it('renders nothing when deposit is null', () => {
    render(<DepositSheet deposit={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId('detail-sheet')).not.toBeInTheDocument();
  });

  it('renders detail sheet when deposit is provided', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    expect(screen.getByTestId('detail-sheet')).toBeInTheDocument();
  });

  it('shows deposit id in title', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    expect(screen.getByText(/deposits\.sheetTitle/)).toBeInTheDocument();
  });

  it('shows token and chain name in subtitle', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    expect(screen.getByTestId('subtitle').textContent).toBe('USDT · BNB Chain');
  });

  it('shows amount formatted', () => {
    render(<DepositSheet deposit={makeDeposit({ amount: 2500 })} onClose={vi.fn()} />);
    expect(screen.getAllByText('2500.00')[0]).toBeInTheDocument();
  });

  it('shows token label near amount', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    expect(screen.getAllByText('USDT')[0]).toBeInTheDocument();
  });

  it('shows status badge', () => {
    render(<DepositSheet deposit={makeDeposit({ status: 'pending' })} onClose={vi.fn()} />);
    expect(screen.getByTestId('status-badge-pending')).toBeInTheDocument();
  });

  it('shows explorer link in footer', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    const link = screen.getByText('deposits.viewExplorer').closest('a') as HTMLAnchorElement;
    expect(link.href).toBe('https://explorer.example.com/tx/0xdeadbeef');
  });

  it('shows close button in footer', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    expect(screen.getByText('deposits.close')).toBeInTheDocument();
  });

  it('shows add-to-sweep button when status is credited', () => {
    render(<DepositSheet deposit={makeDeposit({ status: 'credited' })} onClose={vi.fn()} />);
    expect(screen.getByText('deposits.addToSweep')).toBeInTheDocument();
  });

  it('hides add-to-sweep button when status is not credited', () => {
    render(<DepositSheet deposit={makeDeposit({ status: 'pending' })} onClose={vi.fn()} />);
    expect(screen.queryByText('deposits.addToSweep')).not.toBeInTheDocument();
  });

  it('calls mutate when add-to-sweep button clicked', async () => {
    const user = userEvent.setup();
    render(<DepositSheet deposit={makeDeposit({ status: 'credited' })} onClose={vi.fn()} />);
    await user.click(screen.getByText('deposits.addToSweep').closest('button') as HTMLElement);
    expect(mockAddToSweepMutation.mutate).toHaveBeenCalled();
  });

  it('shows lifecycle section header', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    expect(screen.getByText('deposits.lifecycle')).toBeInTheDocument();
  });

  it('shows detected timeline item', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    expect(screen.getByText('deposits.tlDetected')).toBeInTheDocument();
  });

  it('shows credited timeline item', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    expect(screen.getByText('deposits.tlCredited')).toBeInTheDocument();
  });

  it('shows dash when creditedAt is null', () => {
    render(<DepositSheet deposit={makeDeposit({ creditedAt: null })} onClose={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows awaitingSweep when sweptAt is null', () => {
    render(<DepositSheet deposit={makeDeposit({ sweptAt: null })} onClose={vi.fn()} />);
    expect(screen.getByText('deposits.tlAwaitingSweep')).toBeInTheDocument();
  });

  it('shows details section header', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    expect(screen.getByText('deposits.details')).toBeInTheDocument();
  });

  it('shows user name in details', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows tx hash in details', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    expect(screen.getByText('0xdeadbeef')).toBeInTheDocument();
  });

  it('shows block number formatted with locale', () => {
    render(<DepositSheet deposit={makeDeposit()} onClose={vi.fn()} />);
    expect(screen.getByText('99,999,999')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DepositSheet deposit={makeDeposit()} onClose={onClose} />);
    await user.click(screen.getByText('deposits.close').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
