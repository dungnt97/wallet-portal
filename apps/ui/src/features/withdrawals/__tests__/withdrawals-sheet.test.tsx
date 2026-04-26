// Tests for features/withdrawals/withdrawals-sheet.tsx — withdrawal detail sheet.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

const mockAuth = { staff: { id: 'staff-1' }, hasPerm: vi.fn() };
vi.mock('@/auth/use-auth', () => ({
  useAuth: () => mockAuth,
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
}));

const mockToast = vi.fn();
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
  useToast: () => mockToast,
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
  ROLES: { TREASURER: 'treasurer', ADMIN: 'admin' },
}));

vi.mock('@/lib/format', () => ({
  fmtDateTime: (iso: string) => `fmt:${iso}`,
  fmtUSD: (n: number) => n.toFixed(2),
  shortHash: (hash: string, _a: number, _b: number) => `${hash.slice(0, 6)}…${hash.slice(-4)}`,
}));

vi.mock('../approval-queue', () => ({
  ApprovalQueue: ({ stage }: { stage: string }) => <div data-testid={`approval-queue-${stage}`} />,
}));

vi.mock('../cancel-withdrawal-modal', () => ({
  CancelWithdrawalModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="cancel-modal" /> : null,
}));

vi.mock('../../cold/time-left-display', () => ({
  TimeLeftDisplay: ({ unlockAt }: { unlockAt: string }) => (
    <div data-testid="time-left-display">{unlockAt}</div>
  ),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import type { WithdrawalRow } from '../withdrawal-types';
import { WithdrawalSheet } from '../withdrawals-sheet';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWithdrawal(overrides: Partial<WithdrawalRow> = {}): WithdrawalRow {
  return {
    id: 'wd-001-abcdef123456',
    chain: 'bnb',
    token: 'USDT',
    amount: 5000,
    destination: '0xdest123456789012345678901234567890',
    stage: 'awaiting_signatures',
    risk: 'low',
    createdAt: '2024-01-01T10:00:00Z',
    requestedBy: 'user-1',
    multisig: {
      required: 2,
      total: 3,
      collected: 1,
      approvers: [],
      rejectedBy: null,
    },
    txHash: null,
    note: null,
    ...overrides,
  };
}

const defaultProps = {
  onClose: vi.fn(),
  onApprove: vi.fn(),
  onReject: vi.fn(),
  onExecute: vi.fn(),
  onSubmitDraft: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WithdrawalSheet', () => {
  beforeEach(() => {
    mockAuth.hasPerm = vi.fn().mockReturnValue(false);
    mockToast.mockReset();
  });

  it('renders nothing when withdrawal is null', () => {
    render(<WithdrawalSheet withdrawal={null} {...defaultProps} />);
    expect(screen.queryByTestId('detail-sheet')).not.toBeInTheDocument();
  });

  it('renders detail sheet when withdrawal is provided', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal()} {...defaultProps} />);
    expect(screen.getByTestId('detail-sheet')).toBeInTheDocument();
  });

  it('shows withdrawal id fragment in title', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal()} {...defaultProps} />);
    expect(screen.getByText(/withdrawals\.sheetTitle/)).toBeInTheDocument();
  });

  it('shows amount and chain in subtitle', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal()} {...defaultProps} />);
    const subtitle = screen.getByTestId('subtitle');
    expect(subtitle.textContent).toContain('5000.00');
  });

  it('shows formatted amount in body', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal()} {...defaultProps} />);
    expect(screen.getAllByText('5000.00')[0]).toBeInTheDocument();
  });

  it('shows token label near amount', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal()} {...defaultProps} />);
    expect(screen.getAllByText('USDT')[0]).toBeInTheDocument();
  });

  it('shows chain pill in details', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal()} {...defaultProps} />);
    expect(screen.getByTestId('chain-pill-bnb')).toBeInTheDocument();
  });

  it('shows status badge', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal()} {...defaultProps} />);
    expect(screen.getByTestId('status-badge-awaiting_signatures')).toBeInTheDocument();
  });

  it('shows token pill in details', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal()} {...defaultProps} />);
    expect(screen.getByTestId('token-pill-USDT')).toBeInTheDocument();
  });

  it('shows details section header', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal()} {...defaultProps} />);
    expect(screen.getByText('withdrawals.details')).toBeInTheDocument();
  });

  it('shows formatted creation date', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal()} {...defaultProps} />);
    expect(screen.getByText('fmt:2024-01-01T10:00:00Z')).toBeInTheDocument();
  });

  it('shows txHash when present', () => {
    render(
      <WithdrawalSheet withdrawal={makeWithdrawal({ txHash: '0xabcdef' })} {...defaultProps} />
    );
    expect(screen.getByText('0xabcdef')).toBeInTheDocument();
  });

  it('hides txHash row when null', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal({ txHash: null })} {...defaultProps} />);
    expect(screen.queryByText('withdrawals.dTxHash')).not.toBeInTheDocument();
  });

  it('shows note when present', () => {
    render(
      <WithdrawalSheet withdrawal={makeWithdrawal({ note: 'test memo' })} {...defaultProps} />
    );
    expect(screen.getByText('test memo')).toBeInTheDocument();
  });

  it('renders close button in footer', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal()} {...defaultProps} />);
    expect(screen.getByText('withdrawals.close')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<WithdrawalSheet withdrawal={makeWithdrawal()} {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByText('withdrawals.close').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows submit-to-multisig button when stage is draft', () => {
    render(<WithdrawalSheet withdrawal={makeWithdrawal({ stage: 'draft' })} {...defaultProps} />);
    expect(screen.getByText('withdrawals.submitToMultisig')).toBeInTheDocument();
  });

  it('hides submit button when stage is not draft', () => {
    render(
      <WithdrawalSheet withdrawal={makeWithdrawal({ stage: 'completed' })} {...defaultProps} />
    );
    expect(screen.queryByText('withdrawals.submitToMultisig')).not.toBeInTheDocument();
  });

  it('calls onSubmitDraft when submit button clicked', async () => {
    const onSubmitDraft = vi.fn();
    const user = userEvent.setup();
    render(
      <WithdrawalSheet
        withdrawal={makeWithdrawal({ stage: 'draft' })}
        {...defaultProps}
        onSubmitDraft={onSubmitDraft}
      />
    );
    await user.click(screen.getByText('withdrawals.submitToMultisig'));
    expect(onSubmitDraft).toHaveBeenCalled();
  });

  it('shows approve/reject buttons when canApprove and not already approved', () => {
    mockAuth.hasPerm = vi.fn((perm: string) => perm === 'withdrawal.approve');
    render(
      <WithdrawalSheet
        withdrawal={makeWithdrawal({ stage: 'awaiting_signatures' })}
        {...defaultProps}
      />
    );
    expect(screen.getByText('withdrawals.approveSign')).toBeInTheDocument();
    expect(screen.getByText('withdrawals.rejectBtn')).toBeInTheDocument();
  });

  it('shows youSigned stamp when already approved', () => {
    mockAuth.hasPerm = vi.fn((perm: string) => perm === 'withdrawal.approve');
    const w = makeWithdrawal({
      stage: 'awaiting_signatures',
      multisig: {
        required: 2,
        total: 3,
        collected: 1,
        approvers: [{ staffId: 'staff-1', at: '2024-01-01T00:00:00Z', txSig: 'sig' }],
        rejectedBy: null,
      },
    });
    render(<WithdrawalSheet withdrawal={w} {...defaultProps} />);
    expect(screen.getByText('withdrawals.youSigned')).toBeInTheDocument();
  });

  it('calls onApprove when approve button clicked', async () => {
    const onApprove = vi.fn();
    mockAuth.hasPerm = vi.fn((perm: string) => perm === 'withdrawal.approve');
    const user = userEvent.setup();
    render(
      <WithdrawalSheet
        withdrawal={makeWithdrawal({ stage: 'awaiting_signatures' })}
        {...defaultProps}
        onApprove={onApprove}
      />
    );
    await user.click(screen.getByText('withdrawals.approveSign'));
    expect(onApprove).toHaveBeenCalled();
  });

  it('shows execute button when stage=executing canExecute and no timelock', () => {
    mockAuth.hasPerm = vi.fn((perm: string) => perm === 'withdrawal.execute');
    render(
      <WithdrawalSheet
        withdrawal={makeWithdrawal({ stage: 'executing', timeLockExpiresAt: undefined })}
        {...defaultProps}
      />
    );
    expect(screen.getByText('withdrawals.executeOnChain')).toBeInTheDocument();
  });

  it('calls onExecute and shows toast when execute clicked', async () => {
    const onExecute = vi.fn();
    mockAuth.hasPerm = vi.fn((perm: string) => perm === 'withdrawal.execute');
    const user = userEvent.setup();
    render(
      <WithdrawalSheet
        withdrawal={makeWithdrawal({ stage: 'executing' })}
        {...defaultProps}
        onExecute={onExecute}
      />
    );
    await user.click(screen.getByText('withdrawals.executeOnChain'));
    expect(onExecute).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalled();
  });

  it('shows cold tier badge when sourceTier is cold', () => {
    render(
      <WithdrawalSheet withdrawal={makeWithdrawal({ sourceTier: 'cold' })} {...defaultProps} />
    );
    expect(screen.getByText('withdrawals.tierCold')).toBeInTheDocument();
  });

  it('shows time-left-display when timeLockExpiresAt is set', () => {
    render(
      <WithdrawalSheet
        withdrawal={makeWithdrawal({ timeLockExpiresAt: '2030-01-01T00:00:00Z' })}
        {...defaultProps}
      />
    );
    expect(screen.getAllByTestId('time-left-display')[0]).toBeInTheDocument();
  });

  it('renders cancel button for cold+cancellable stage when hasPerm', () => {
    mockAuth.hasPerm = vi.fn((perm: string) => perm === 'withdrawals.cancel');
    render(
      <WithdrawalSheet
        withdrawal={makeWithdrawal({ sourceTier: 'cold', stage: 'awaiting_signatures' })}
        {...defaultProps}
      />
    );
    expect(screen.getByText('withdrawals.cancel.btn')).toBeInTheDocument();
  });

  it('opens cancel modal when cancel button clicked', async () => {
    mockAuth.hasPerm = vi.fn((perm: string) => perm === 'withdrawals.cancel');
    const user = userEvent.setup();
    render(
      <WithdrawalSheet
        withdrawal={makeWithdrawal({ sourceTier: 'cold', stage: 'awaiting_signatures' })}
        {...defaultProps}
      />
    );
    await user.click(screen.getByText('withdrawals.cancel.btn').closest('button') as HTMLElement);
    expect(screen.getByTestId('cancel-modal')).toBeInTheDocument();
  });

  it('renders approval queue component', () => {
    render(
      <WithdrawalSheet
        withdrawal={makeWithdrawal({ stage: 'awaiting_signatures' })}
        {...defaultProps}
      />
    );
    expect(screen.getByTestId('approval-queue-awaiting_signatures')).toBeInTheDocument();
  });
});
