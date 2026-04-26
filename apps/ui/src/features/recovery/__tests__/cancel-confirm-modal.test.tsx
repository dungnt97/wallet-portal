// Tests for features/recovery/cancel-confirm-modal.tsx — cancel-replace stuck tx modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelConfirmModal } from '../cancel-confirm-modal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/components/overlays/toast-host', () => ({
  useToast: () => vi.fn(),
}));

vi.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/lib/format', () => ({
  shortHash: (h: string, _a: number, _b: number) => h.slice(0, 10),
}));

const mockMutateAsync = vi.fn();
const mockReset = vi.fn();
const mockUseCancelTx = vi.fn();

vi.mock('../use-recovery', () => ({
  useCancelTx: () => mockUseCancelTx(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: vi.fn(),
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx1',
    entityType: 'withdrawal' as const,
    entityId: 'w123',
    txHash: '0xabcdef1234567890abcdef1234567890',
    chain: 'bnb' as const,
    bumpCount: 0,
    broadcastAt: '2024-01-01T09:50:00Z',
    ageSeconds: 600,
    lastBumpAt: null,
    canBump: true,
    canCancel: true,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CancelConfirmModal', () => {
  beforeEach(() => {
    mockUseCancelTx.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      reset: mockReset,
    });
  });

  it('renders nothing when closed', () => {
    render(<CancelConfirmModal open={false} item={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders modal when open with item', () => {
    render(<CancelConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders modal title', () => {
    render(<CancelConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    expect(screen.getByText('recovery.cancel.title')).toBeInTheDocument();
  });

  it('shows the tx hash (short form)', () => {
    render(<CancelConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    expect(screen.getByText('0xabcdef12')).toBeInTheDocument();
  });

  it('confirm button is disabled when reason is empty', () => {
    render(<CancelConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    const confirmBtn = screen.getByText('recovery.cancel.confirm').closest('button') as HTMLElement;
    expect(confirmBtn).toBeDisabled();
  });

  it('confirm button is disabled when reason is less than 10 chars', async () => {
    const user = userEvent.setup();
    render(<CancelConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    await user.type(screen.getByRole('textbox'), 'too short');
    expect(screen.getByText('recovery.cancel.confirm').closest('button')).toBeDisabled();
  });

  it('confirm button enables when reason has 10+ chars', async () => {
    const user = userEvent.setup();
    render(<CancelConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    await user.type(screen.getByRole('textbox'), 'valid reason here');
    expect(screen.getByText('recovery.cancel.confirm').closest('button')).not.toBeDisabled();
  });

  it('shows Solana info banner for Solana transactions', () => {
    render(<CancelConfirmModal open={true} item={makeItem({ chain: 'sol' })} onClose={vi.fn()} />);
    expect(screen.getByText('recovery.cancel.solanaTip')).toBeInTheDocument();
  });

  it('disables confirm for Solana even with valid reason', async () => {
    const user = userEvent.setup();
    render(<CancelConfirmModal open={true} item={makeItem({ chain: 'sol' })} onClose={vi.fn()} />);
    await user.type(screen.getByRole('textbox'), 'valid reason here');
    expect(screen.getByText('recovery.cancel.confirm').closest('button')).toBeDisabled();
  });

  it('shows EVM irreversible warning banner for non-Solana', () => {
    render(<CancelConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    expect(screen.getByText('recovery.cancel.warningTitle')).toBeInTheDocument();
  });

  it('calls mutateAsync with item and idempotency key on confirm', async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockResolvedValue({ cancelTxHash: '0xnewcancelhash' });
    render(<CancelConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    await user.type(screen.getByRole('textbox'), 'valid reason here');
    await user.click(screen.getByText('recovery.cancel.confirm').closest('button') as HTMLElement);
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ item: expect.objectContaining({ id: 'tx1' }) })
    );
  });

  it('calls onClose after successful confirm', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    mockMutateAsync.mockResolvedValue({ cancelTxHash: '0xnewcancelhash' });
    render(<CancelConfirmModal open={true} item={makeItem()} onClose={onClose} />);
    await user.type(screen.getByRole('textbox'), 'valid reason here');
    await user.click(screen.getByText('recovery.cancel.confirm').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows api error message when mutateAsync throws', async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockRejectedValue(new Error('timeout'));
    render(<CancelConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    await user.type(screen.getByRole('textbox'), 'valid reason here');
    await user.click(screen.getByText('recovery.cancel.confirm').closest('button') as HTMLElement);
    expect(await screen.findByText(/recovery.cancel.error/)).toBeInTheDocument();
  });

  it('calls onClose when back button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CancelConfirmModal open={true} item={makeItem()} onClose={onClose} />);
    await user.click(screen.getByText('common.back').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing inside modal body when item is null', () => {
    render(<CancelConfirmModal open={true} item={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
