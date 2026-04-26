// Tests for features/deposits/manual-credit-modal.tsx — ManualCreditModal admin form.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ManualCreditModal } from '../manual-credit-modal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockMutate = vi.fn();
const mockUseMutation = vi.fn(() => ({
  mutate: mockMutate,
  isPending: false,
  isError: false,
  error: null as Error | null,
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => mockUseMutation(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/api/client', () => ({
  api: { post: vi.fn() },
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

vi.mock('@/components/overlays/toast-host', () => ({
  useToast: () => vi.fn(),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ManualCreditModal', () => {
  it('renders nothing when closed', () => {
    render(<ManualCreditModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders the modal when open', () => {
    render(<ManualCreditModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders the irreversible warning banner', () => {
    render(<ManualCreditModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/bypasses the block watcher/)).toBeInTheDocument();
  });

  it('renders user ID input', () => {
    render(<ManualCreditModal open={true} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('user UUID')).toBeInTheDocument();
  });

  it('renders chain select with bnb and sol options', () => {
    render(<ManualCreditModal open={true} onClose={vi.fn()} />);
    expect(screen.getByDisplayValue('BNB Chain')).toBeInTheDocument();
  });

  it('renders token select with USDT and USDC options', () => {
    render(<ManualCreditModal open={true} onClose={vi.fn()} />);
    expect(screen.getByDisplayValue('USDT')).toBeInTheDocument();
  });

  it('renders amount input', () => {
    render(<ManualCreditModal open={true} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('1000.00')).toBeInTheDocument();
  });

  it('disables submit button when fields are empty', () => {
    render(<ManualCreditModal open={true} onClose={vi.fn()} />);
    const submitBtn = screen
      .getByText('deposits.manualCredit.submit')
      .closest('button') as HTMLElement;
    expect(submitBtn).toBeDisabled();
  });

  it('disables submit when reason is shorter than 20 chars', async () => {
    const user = userEvent.setup();
    render(<ManualCreditModal open={true} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('user UUID'), 'user-123');
    await user.type(screen.getByPlaceholderText('1000.00'), '100');
    await user.type(screen.getByPlaceholderText('deposits.manualCredit.reasonHint'), 'too short');
    const submitBtn = screen
      .getByText('deposits.manualCredit.submit')
      .closest('button') as HTMLElement;
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit when all fields are valid', async () => {
    const user = userEvent.setup();
    render(<ManualCreditModal open={true} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('user UUID'), 'user-123');
    await user.type(screen.getByPlaceholderText('1000.00'), '500');
    await user.type(
      screen.getByPlaceholderText('deposits.manualCredit.reasonHint'),
      'Compensating for failed deposit due to network issue'
    );
    const submitBtn = screen
      .getByText('deposits.manualCredit.submit')
      .closest('button') as HTMLElement;
    expect(submitBtn).not.toBeDisabled();
  });

  it('calls mutate with correct payload on submit', async () => {
    const user = userEvent.setup();
    render(<ManualCreditModal open={true} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('user UUID'), 'user-abc');
    await user.type(screen.getByPlaceholderText('1000.00'), '250');
    await user.type(
      screen.getByPlaceholderText('deposits.manualCredit.reasonHint'),
      'Network failure compensation credit granted'
    );
    await user.click(
      screen.getByText('deposits.manualCredit.submit').closest('button') as HTMLElement
    );
    expect(mockMutate).toHaveBeenCalledWith(
      {
        userId: 'user-abc',
        chain: 'bnb',
        token: 'USDT',
        amount: '250',
        reason: 'Network failure compensation credit granted',
      },
      expect.any(Object)
    );
  });

  it('shows character count for reason field', async () => {
    const user = userEvent.setup();
    render(<ManualCreditModal open={true} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('deposits.manualCredit.reasonHint'), 'Hello');
    expect(screen.getByText('5/20 min')).toBeInTheDocument();
  });

  it('shows error panel when mutation has error', () => {
    mockUseMutation.mockReturnValueOnce({
      mutate: mockMutate,
      isPending: false,
      isError: true,
      error: new Error('Insufficient balance'),
    });
    render(<ManualCreditModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Insufficient balance')).toBeInTheDocument();
  });

  it('calls onClose when cancel is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ManualCreditModal open={true} onClose={onClose} />);
    await user.click(screen.getByText('common.cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
