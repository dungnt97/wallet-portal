// Tests for features/sweep/sweep-confirm-modal.tsx — sweep execution confirm dialog.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SweepConfirmModal } from '../sweep-confirm-modal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/lib/format', () => ({
  fmtUSD: (n: number) => n.toFixed(2),
}));

vi.mock('@/lib/constants', () => ({
  CHAINS: {
    bnb: { name: 'BNB Chain' },
    sol: { name: 'Solana' },
  },
}));

vi.mock('@/icons', () => ({
  I: new Proxy(
    {},
    {
      get:
        (_t, key) =>
        ({ size, className }: { size?: number; className?: string }) => (
          <span data-testid={`icon-${String(key)}`} className={className} data-size={size} />
        ),
    }
  ),
}));

vi.mock('@/components/overlays/modal', () => ({
  Modal: ({
    open,
    onClose,
    title,
    children,
    footer,
  }: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="modal">
        <h2>{title}</h2>
        {children}
        <div data-testid="modal-footer">{footer}</div>
        <button type="button" data-testid="modal-close" onClick={onClose}>
          X
        </button>
      </div>
    ) : null,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  executing: false,
  chain: 'bnb' as const,
  addressesCount: 5,
  totalUSDT: 1000,
  totalUSDC: 500,
  total: 1500,
  estFee: 0.0012,
  onConfirm: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SweepConfirmModal', () => {
  it('renders nothing when closed', () => {
    render(<SweepConfirmModal {...defaultProps} open={false} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders modal when open', () => {
    render(<SweepConfirmModal {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('shows confirm title', () => {
    render(<SweepConfirmModal {...defaultProps} />);
    expect(screen.getByText('sweep.confirmTitle')).toBeInTheDocument();
  });

  it('shows irreversible warning banner', () => {
    render(<SweepConfirmModal {...defaultProps} />);
    expect(screen.getByText('sweep.irreversibleTitle')).toBeInTheDocument();
  });

  it('shows address count', () => {
    render(<SweepConfirmModal {...defaultProps} addressesCount={7} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('shows USDT amount formatted', () => {
    render(<SweepConfirmModal {...defaultProps} totalUSDT={1000} />);
    expect(screen.getByText('$1000.00')).toBeInTheDocument();
  });

  it('shows USDC amount formatted', () => {
    render(<SweepConfirmModal {...defaultProps} totalUSDC={500} />);
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('shows BNB hot wallet for BNB chain', () => {
    render(<SweepConfirmModal {...defaultProps} chain="bnb" />);
    expect(screen.getByText(/BSC hot wallet/)).toBeInTheDocument();
  });

  it('shows Solana hot wallet for SOL chain', () => {
    render(<SweepConfirmModal {...defaultProps} chain="sol" />);
    expect(screen.getByText(/Solana hot wallet/)).toBeInTheDocument();
  });

  it('shows estimated BNB fee with 4 decimal places', () => {
    render(<SweepConfirmModal {...defaultProps} chain="bnb" estFee={0.0012} />);
    expect(screen.getByText('0.0012 BNB')).toBeInTheDocument();
  });

  it('shows estimated SOL fee with 6 decimal places', () => {
    render(<SweepConfirmModal {...defaultProps} chain="sol" estFee={0.000025} />);
    expect(screen.getByText('0.000025 SOL')).toBeInTheDocument();
  });

  it('shows sign-and-broadcast button with address count', () => {
    render(<SweepConfirmModal {...defaultProps} addressesCount={3} />);
    expect(screen.getByText('sweep.signBroadcast')).toBeInTheDocument();
  });

  it('shows executing spinner when executing=true', () => {
    render(<SweepConfirmModal {...defaultProps} executing={true} />);
    expect(screen.getByText('sweep.executing')).toBeInTheDocument();
  });

  it('disables buttons when executing', () => {
    render(<SweepConfirmModal {...defaultProps} executing={true} />);
    const buttons = screen.getAllByRole('button');
    // cancel and confirm should both be disabled
    const disabled = buttons.filter((b) => (b as HTMLButtonElement).disabled);
    expect(disabled.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onConfirm when confirm button clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<SweepConfirmModal {...defaultProps} onConfirm={onConfirm} />);
    await user.click(screen.getByText('sweep.signBroadcast').closest('button') as HTMLElement);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onClose when cancel is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SweepConfirmModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByText('common.cancel').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
