// UI tests for BumpConfirmModal — renders tx hash, confirm/cancel buttons,
// calls bump mutation on confirm, shows error on failure.
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
    Zap: () => <span data-testid="icon-zap" />,
  },
}));

vi.mock('@/lib/format', () => ({
  shortHash: (h: string) => `${h.slice(0, 8)}…`,
}));

// Mock the recovery hooks
const mockMutateAsync = vi.fn();
const mockReset = vi.fn();
vi.mock('../use-recovery', () => ({
  useBumpTx: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    reset: mockReset,
  }),
  RECOVERY_QUERY_KEY: 'recovery.stuck',
}));

import { BumpConfirmModal } from '../bump-confirm-modal';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUCK_ITEM: StuckTxItem = {
  entityType: 'withdrawal',
  entityId: 'wd-uuid-0001',
  chain: 'bnb',
  txHash: `0x${'ab'.repeat(32)}`,
  broadcastAt: new Date(Date.now() - 15 * 60_000).toISOString(),
  ageSeconds: 900,
  bumpCount: 0,
  lastBumpAt: null,
  canBump: true,
  canCancel: true,
};

function renderModal(open: boolean, item: StuckTxItem | null = STUCK_ITEM, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BumpConfirmModal open={open} item={item} onClose={onClose} />
    </QueryClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BumpConfirmModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock crypto.randomUUID
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: () => 'test-uuid-1234' },
      configurable: true,
    });
  });

  it('does not render when open=false', () => {
    renderModal(false);
    expect(screen.queryByTestId('modal')).toBeNull();
  });

  it('renders modal when open=true with item', () => {
    renderModal(true);
    expect(screen.getByTestId('modal')).toBeTruthy();
  });

  it('shows tx hash (shortened) in modal body', () => {
    renderModal(true);
    // shortHash returns first 8 chars + ellipsis
    expect(screen.getByTestId('modal-body').textContent).toContain('0xababab…');
  });

  it('calls mutateAsync with item and idempotencyKey on confirm click', async () => {
    mockMutateAsync.mockResolvedValueOnce({ newTxHash: `0x${'cd'.repeat(32)}`, bumpCount: 1 });
    const onClose = vi.fn();
    renderModal(true, STUCK_ITEM, onClose);

    const confirmBtn = screen.getByText('recovery.bump.confirm');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        item: STUCK_ITEM,
        idempotencyKey: 'test-uuid-1234',
      });
    });
  });

  it('calls onClose after successful bump', async () => {
    mockMutateAsync.mockResolvedValueOnce({ newTxHash: '0xnew', bumpCount: 1 });
    const onClose = vi.fn();
    renderModal(true, STUCK_ITEM, onClose);

    fireEvent.click(screen.getByText('recovery.bump.confirm'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows error alert when mutateAsync rejects', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('gas oracle down'));
    renderModal(true);

    fireEvent.click(screen.getByText('recovery.bump.confirm'));

    await waitFor(() => {
      // In test environment i18n keys are rendered as-is.
      // The component renders t('recovery.bump.error', { msg }) → key string shown.
      // We verify the error alert element appears (alert-icon is rendered on error).
      expect(screen.getAllByTestId('icon-alert').length).toBeGreaterThan(0);
    });
  });

  it('renders nothing in body when item=null', () => {
    renderModal(true, null);
    expect(screen.getByTestId('modal-body').textContent).toBe('');
  });
});
