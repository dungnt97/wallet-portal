// UI tests for CancelConfirmModal — Solana guard banner, reason validation (min 10 chars),
// confirm button state, successful cancel flow, and error display.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { StuckTxItem } from '@wp/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/components/overlays', () => ({
  Modal: ({
    open,
    children,
    footer,
    title,
  }: {
    open: boolean;
    children: React.ReactNode;
    footer: React.ReactNode;
    title: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="modal">
        <div data-testid="modal-title">{title}</div>
        <div data-testid="modal-body">{children}</div>
        <div data-testid="modal-footer">{footer}</div>
      </div>
    ) : null,
  useToast: () => vi.fn(),
}));

vi.mock('@/icons', () => ({
  I: {
    AlertTri: () => <span data-testid="icon-alert" />,
    X: () => <span data-testid="icon-x" />,
  },
}));

vi.mock('@/lib/format', () => ({
  shortHash: (h: string) => `${h.slice(0, 8)}…`,
}));

// Mock the recovery hooks
const mockMutateAsync = vi.fn();
const mockReset = vi.fn();
vi.mock('../use-recovery', () => ({
  useCancelTx: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    reset: mockReset,
  }),
  RECOVERY_QUERY_KEY: 'recovery.stuck',
}));

import { CancelConfirmModal } from '../cancel-confirm-modal';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EVM_ITEM: StuckTxItem = {
  entityType: 'withdrawal',
  entityId: 'wd-cancel-0001',
  chain: 'bnb',
  txHash: `0x${'ab'.repeat(32)}`,
  broadcastAt: new Date(Date.now() - 15 * 60_000).toISOString(),
  ageSeconds: 900,
  bumpCount: 0,
  lastBumpAt: null,
  canBump: true,
  canCancel: true,
};

const SOLANA_ITEM: StuckTxItem = {
  ...EVM_ITEM,
  entityId: 'wd-sol-0001',
  chain: 'sol',
  canCancel: false,
};

function renderModal(open: boolean, item: StuckTxItem | null = EVM_ITEM, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CancelConfirmModal open={open} item={item} onClose={onClose} />
    </QueryClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CancelConfirmModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: () => 'cancel-uuid-5678' },
      configurable: true,
    });
  });

  it('does not render when open=false', () => {
    renderModal(false);
    expect(screen.queryByTestId('modal')).toBeNull();
  });

  it('renders modal when open=true', () => {
    renderModal(true);
    expect(screen.getByTestId('modal')).toBeTruthy();
  });

  it('shows Solana not-supported banner for Solana item', () => {
    renderModal(true, SOLANA_ITEM);
    const body = screen.getByTestId('modal-body').textContent ?? '';
    expect(body).toContain('recovery.cancel.solanaTip');
  });

  it('does NOT show Solana banner for EVM item', () => {
    renderModal(true, EVM_ITEM);
    const body = screen.getByTestId('modal-body').textContent ?? '';
    expect(body).not.toContain('recovery.cancel.solanaTip');
  });

  it('shows irreversible warning banner for EVM item', () => {
    renderModal(true, EVM_ITEM);
    const body = screen.getByTestId('modal-body').textContent ?? '';
    expect(body).toContain('recovery.cancel.warningTitle');
  });

  it('confirm button is disabled when reason is shorter than 10 chars', () => {
    renderModal(true, EVM_ITEM);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'short' } });
    const confirmBtn = screen.getByText('recovery.cancel.confirm');
    expect(confirmBtn).toBeDisabled();
  });

  it('confirm button is enabled when reason is 10+ chars', () => {
    renderModal(true, EVM_ITEM);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'valid reason for cancel' } });
    const confirmBtn = screen.getByText('recovery.cancel.confirm');
    expect(confirmBtn).not.toBeDisabled();
  });

  it('confirm button is always disabled for Solana item', () => {
    renderModal(true, SOLANA_ITEM);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'valid reason for cancel' } });
    const confirmBtn = screen.getByText('recovery.cancel.confirm');
    expect(confirmBtn).toBeDisabled();
  });

  it('calls mutateAsync with item and idempotencyKey on confirm', async () => {
    mockMutateAsync.mockResolvedValueOnce({ cancelTxHash: `0x${'cc'.repeat(32)}` });
    const onClose = vi.fn();
    renderModal(true, EVM_ITEM, onClose);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'valid reason for cancel test' } });
    fireEvent.click(screen.getByText('recovery.cancel.confirm'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        item: EVM_ITEM,
        idempotencyKey: 'cancel-uuid-5678',
      });
    });
  });

  it('calls onClose after successful cancel', async () => {
    mockMutateAsync.mockResolvedValueOnce({ cancelTxHash: '0xnewcancel' });
    const onClose = vi.fn();
    renderModal(true, EVM_ITEM, onClose);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'valid reason for cancel test' } });
    fireEvent.click(screen.getByText('recovery.cancel.confirm'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows error alert when mutateAsync rejects', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('hot safe not configured'));
    renderModal(true, EVM_ITEM);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'valid reason for cancel test' } });
    fireEvent.click(screen.getByText('recovery.cancel.confirm'));

    await waitFor(() => {
      // In test environment i18n keys render as-is; verify the error alert icon appears.
      // The cancel modal shows icon-alert for both the warning banner AND the error banner,
      // so we check count increased (warning already has 1, error adds another).
      const icons = screen.getAllByTestId('icon-alert');
      expect(icons.length).toBeGreaterThanOrEqual(2);
    });
  });
});
