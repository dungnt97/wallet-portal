// Tests for features/multisig/multisig-sheet.tsx — multisig op detail sheet.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAuth = {
  staff: { id: 'staff-1', role: 'treasurer' } as { id: string; role: string } | null,
};
vi.mock('@/auth/use-auth', () => ({
  useAuth: () => mockAuth,
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
  shortHash: (hash: string, _a: number, _b: number) => `${hash.slice(0, 6)}…${hash.slice(-4)}`,
}));

vi.mock('../../withdrawals/approval-queue', () => ({
  ApprovalQueue: ({ stage }: { stage: string }) => <div data-testid={`approval-queue-${stage}`} />,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { MultisigSheet } from '../multisig-sheet';
import type { MultisigOpDisplay } from '../multisig-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOp(overrides: Partial<MultisigOpDisplay> = {}): MultisigOpDisplay {
  return {
    id: 'op-abc-001',
    withdrawalId: 'wd-001',
    chain: 'bnb',
    operationType: 'withdrawal',
    multisigAddr: '0xmultisig',
    safeName: 'BNB Vault',
    amount: 3000,
    token: 'USDT',
    destination: '0xdestination1234567890abcdef',
    nonce: 42,
    required: 2,
    total: 3,
    collected: 1,
    approvers: [],
    rejectedBy: null,
    status: 'collecting',
    expiresAt: '2025-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

const defaultProps = {
  onClose: vi.fn(),
  onApprove: vi.fn(),
  onReject: vi.fn(),
  onExecute: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MultisigSheet', () => {
  beforeEach(() => {
    mockAuth.staff = { id: 'staff-1', role: 'treasurer' };
  });

  it('renders nothing when op is null', () => {
    render(<MultisigSheet op={null} {...defaultProps} />);
    expect(screen.queryByTestId('detail-sheet')).not.toBeInTheDocument();
  });

  it('renders sheet when op is provided', () => {
    render(<MultisigSheet op={makeOp()} {...defaultProps} />);
    expect(screen.getByTestId('detail-sheet')).toBeInTheDocument();
  });

  it('shows op id in title', () => {
    render(<MultisigSheet op={makeOp()} {...defaultProps} />);
    expect(screen.getByText('Multisig op-abc-001')).toBeInTheDocument();
  });

  it('shows safeName and nonce in subtitle', () => {
    render(<MultisigSheet op={makeOp()} {...defaultProps} />);
    expect(screen.getByTestId('subtitle').textContent).toBe('BNB Vault · nonce 42');
  });

  it('shows formatted amount', () => {
    render(<MultisigSheet op={makeOp()} {...defaultProps} />);
    expect(screen.getByText('3000.00')).toBeInTheDocument();
  });

  it('shows token label', () => {
    render(<MultisigSheet op={makeOp()} {...defaultProps} />);
    expect(screen.getByText('USDT')).toBeInTheDocument();
  });

  it('shows BNB Chain label for bnb chain', () => {
    render(<MultisigSheet op={makeOp({ chain: 'bnb' })} {...defaultProps} />);
    expect(screen.getByText(/BNB Chain/)).toBeInTheDocument();
  });

  it('shows Solana label for sol chain', () => {
    render(<MultisigSheet op={makeOp({ chain: 'sol' })} {...defaultProps} />);
    expect(screen.getByText(/Solana/)).toBeInTheDocument();
  });

  it('shows calldata section header', () => {
    render(<MultisigSheet op={makeOp()} {...defaultProps} />);
    expect(screen.getByText('Calldata')).toBeInTheDocument();
  });

  it('includes multisigAddr in calldata', () => {
    render(<MultisigSheet op={makeOp()} {...defaultProps} />);
    expect(screen.getByText(/0xmultisig/)).toBeInTheDocument();
  });

  it('includes operationType in calldata', () => {
    render(<MultisigSheet op={makeOp()} {...defaultProps} />);
    expect(screen.getByText(/withdrawal/)).toBeInTheDocument();
  });

  it('shows Close button in footer', () => {
    render(<MultisigSheet op={makeOp()} {...defaultProps} />);
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('calls onClose when Close button clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MultisigSheet op={makeOp()} {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByText('Close').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows Approve and Reject buttons for treasurer when collecting and not signed', () => {
    render(<MultisigSheet op={makeOp({ status: 'collecting' })} {...defaultProps} />);
    expect(screen.getByText('Approve & sign')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
  });

  it('calls onApprove when Approve & sign clicked', async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(
      <MultisigSheet
        op={makeOp({ status: 'collecting' })}
        {...defaultProps}
        onApprove={onApprove}
      />
    );
    await user.click(screen.getByText('Approve & sign'));
    expect(onApprove).toHaveBeenCalled();
  });

  it('calls onReject when Reject clicked', async () => {
    const onReject = vi.fn();
    const user = userEvent.setup();
    render(
      <MultisigSheet op={makeOp({ status: 'collecting' })} {...defaultProps} onReject={onReject} />
    );
    await user.click(screen.getByText('Reject').closest('button') as HTMLElement);
    expect(onReject).toHaveBeenCalled();
  });

  it('shows you-signed stamp when already signed', () => {
    const op = makeOp({
      status: 'collecting',
      approvers: [{ staffId: 'staff-1', at: '2024-01-01T00:00:00Z', txSig: 'sig' }],
    });
    render(<MultisigSheet op={op} {...defaultProps} />);
    expect(screen.getByText('you signed')).toBeInTheDocument();
  });

  it('shows Treasurers only button for non-treasurer staff', () => {
    mockAuth.staff = { id: 'staff-1', role: 'admin' };
    render(<MultisigSheet op={makeOp({ status: 'collecting' })} {...defaultProps} />);
    expect(screen.getByText('Treasurers only')).toBeInTheDocument();
  });

  it('shows Execute on-chain button when status is ready', () => {
    render(<MultisigSheet op={makeOp({ status: 'ready' })} {...defaultProps} />);
    expect(screen.getByText('Execute on-chain')).toBeInTheDocument();
  });

  it('calls onExecute when Execute on-chain clicked', async () => {
    const onExecute = vi.fn();
    const user = userEvent.setup();
    render(
      <MultisigSheet op={makeOp({ status: 'ready' })} {...defaultProps} onExecute={onExecute} />
    );
    await user.click(screen.getByText('Execute on-chain'));
    expect(onExecute).toHaveBeenCalled();
  });

  it('renders approval queue with awaiting_signatures stage when collecting', () => {
    render(<MultisigSheet op={makeOp({ status: 'collecting' })} {...defaultProps} />);
    expect(screen.getByTestId('approval-queue-awaiting_signatures')).toBeInTheDocument();
  });

  it('renders approval queue with executing stage when ready', () => {
    render(<MultisigSheet op={makeOp({ status: 'ready' })} {...defaultProps} />);
    expect(screen.getByTestId('approval-queue-executing')).toBeInTheDocument();
  });

  it('shows Amount label', () => {
    render(<MultisigSheet op={makeOp()} {...defaultProps} />);
    expect(screen.getByText('Amount')).toBeInTheDocument();
  });

  it('does not show approve buttons when staff is null', () => {
    mockAuth.staff = null;
    render(<MultisigSheet op={makeOp({ status: 'collecting' })} {...defaultProps} />);
    expect(screen.queryByText('Approve & sign')).not.toBeInTheDocument();
  });
});
