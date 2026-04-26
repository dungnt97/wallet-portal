// Tests for features/recovery/bump-confirm-modal.tsx — gas bump stuck tx modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BumpConfirmModal } from '../bump-confirm-modal';

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
const mockUseBumpTx = vi.fn();

vi.mock('../use-recovery', () => ({
  useBumpTx: () => mockUseBumpTx(),
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

describe('BumpConfirmModal', () => {
  beforeEach(() => {
    mockUseBumpTx.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      reset: mockReset,
    });
  });

  it('renders nothing when closed', () => {
    render(<BumpConfirmModal open={false} item={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders modal when open with item', () => {
    render(<BumpConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders modal title', () => {
    render(<BumpConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    expect(screen.getByText('recovery.bump.title')).toBeInTheDocument();
  });

  it('shows the short tx hash', () => {
    render(<BumpConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    expect(screen.getByText('0xabcdef12')).toBeInTheDocument();
  });

  it('shows bump info warning banner', () => {
    render(<BumpConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    expect(screen.getByText('recovery.bump.infoTitle')).toBeInTheDocument();
  });

  it('shows chain label', () => {
    render(<BumpConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    expect(screen.getByText('BNB')).toBeInTheDocument();
  });

  it('shows bump count as bumpCount + 1', () => {
    render(<BumpConfirmModal open={true} item={makeItem({ bumpCount: 2 })} onClose={vi.fn()} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders confirm button with correct label', () => {
    render(<BumpConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    expect(screen.getByText('recovery.bump.confirm')).toBeInTheDocument();
  });

  it('renders back button', () => {
    render(<BumpConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    expect(screen.getByText('common.back')).toBeInTheDocument();
  });

  it('calls mutateAsync when confirm is clicked', async () => {
    mockMutateAsync.mockResolvedValue({ newTxHash: '0xnewtxhash' });
    const user = userEvent.setup();
    render(<BumpConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    await user.click(screen.getByText('recovery.bump.confirm').closest('button') as HTMLElement);
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ item: expect.objectContaining({ id: 'tx1' }) })
    );
  });

  it('calls onClose after successful bump', async () => {
    mockMutateAsync.mockResolvedValue({ newTxHash: '0xnewtxhash' });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BumpConfirmModal open={true} item={makeItem()} onClose={onClose} />);
    await user.click(screen.getByText('recovery.bump.confirm').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows api error panel when mutateAsync throws', async () => {
    mockMutateAsync.mockRejectedValue(new Error('gas limit exceeded'));
    const user = userEvent.setup();
    render(<BumpConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    await user.click(screen.getByText('recovery.bump.confirm').closest('button') as HTMLElement);
    expect(await screen.findByText(/recovery.bump.error/)).toBeInTheDocument();
  });

  it('calls onClose when back button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BumpConfirmModal open={true} item={makeItem()} onClose={onClose} />);
    await user.click(screen.getByText('common.back').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders empty body when item is null but modal is open', () => {
    render(<BumpConfirmModal open={true} item={null} onClose={vi.fn()} />);
    expect(screen.queryByText('recovery.bump.infoTitle')).not.toBeInTheDocument();
  });

  it('disables buttons while pending', () => {
    mockUseBumpTx.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
      reset: mockReset,
    });
    render(<BumpConfirmModal open={true} item={makeItem()} onClose={vi.fn()} />);
    expect(screen.getByText('common.back').closest('button')).toBeDisabled();
    expect(screen.getByText('…').closest('button')).toBeDisabled();
  });
});
