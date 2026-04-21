// Vitest component tests for RebalanceModal — renders, validates, submits, calls mutation.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { RebalanceModal } from '../rebalance-modal';

// ── Mock API client so no real HTTP happens ──────────────────────────────────

vi.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  registerStepUpHandler: vi.fn(),
  unregisterStepUpHandler: vi.fn(),
}));

// ── Mock useRebalance to control mutation behaviour ──────────────────────────

const mockMutateAsync = vi.fn();
const mockReset = vi.fn();

vi.mock('@/api/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/queries')>();
  return {
    ...actual,
    useRebalance: () => ({
      mutateAsync: mockMutateAsync,
      isPending: false,
      reset: mockReset,
    }),
  };
});

// ── Mock overlays (Sheet + useToast) ─────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/components/overlays', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/overlays')>();
  return {
    ...actual,
    useToast: () => mockToast,
    Sheet: ({
      open,
      children,
      footer,
    }: {
      open: boolean;
      children: React.ReactNode;
      footer?: React.ReactNode;
    }) =>
      open ? (
        <div data-testid="sheet">
          {children}
          {footer}
        </div>
      ) : null,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderModal(props: {
  open: boolean;
  chain: 'bnb' | 'sol' | null;
  direction?: 'hot→cold' | 'cold→hot';
  onClose?: () => void;
}) {
  const onClose = props.onClose ?? vi.fn();
  const qc = makeQueryClient();
  render(
    <QueryClientProvider client={qc}>
      <RebalanceModal
        open={props.open}
        chain={props.chain}
        direction={props.direction ?? 'hot→cold'}
        onClose={onClose}
      />
    </QueryClientProvider>
  );
  return { onClose };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RebalanceModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ open: false, chain: 'bnb' });
    expect(screen.queryByTestId('sheet')).toBeNull();
  });

  it('renders the chain label and token selector when open', () => {
    renderModal({ open: true, chain: 'bnb' });
    expect(screen.getByTestId('sheet')).toBeDefined();
    // Chain field should show BNB Chain
    expect(screen.getByText('BNB Chain')).toBeDefined();
    // Token buttons present
    expect(screen.getByText('USDT')).toBeDefined();
    expect(screen.getByText('USDC')).toBeDefined();
  });

  it('shows Solana label when chain=sol', () => {
    renderModal({ open: true, chain: 'sol' });
    expect(screen.getByText('Solana')).toBeDefined();
  });

  it('submit button is disabled when amount is empty', () => {
    renderModal({ open: true, chain: 'bnb' });
    const submitBtn = screen.getByTestId('rebalance-submit-btn');
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('submit button enables after entering a positive amount', () => {
    renderModal({ open: true, chain: 'bnb' });
    const amountInput = screen.getByTestId('rebalance-amount-input');
    fireEvent.change(amountInput, { target: { value: '500' } });
    const submitBtn = screen.getByTestId('rebalance-submit-btn');
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls mutateAsync with correct body on submit', async () => {
    mockMutateAsync.mockResolvedValue({
      withdrawalId: 'wd-test-001',
      multisigOpId: 'op-001',
      destinationAddr: '0xCold',
      status: 'pending',
    });

    renderModal({ open: true, chain: 'bnb' });

    const amountInput = screen.getByTestId('rebalance-amount-input');
    fireEvent.change(amountInput, { target: { value: '1000' } });

    fireEvent.click(screen.getByTestId('rebalance-submit-btn'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        chain: 'bnb',
        token: 'USDT',
        amountMinor: '1000000000', // 1000 * 1_000_000
        direction: 'hot_to_cold',
      });
    });
  });

  it('shows success toast and calls onClose after successful submit', async () => {
    mockMutateAsync.mockResolvedValue({
      withdrawalId: 'wd-test-abc',
      multisigOpId: 'op-abc',
      destinationAddr: '0xCold',
      status: 'pending',
    });
    const { onClose } = renderModal({ open: true, chain: 'sol' });

    const amountInput = screen.getByTestId('rebalance-amount-input');
    fireEvent.change(amountInput, { target: { value: '200' } });
    fireEvent.click(screen.getByTestId('rebalance-submit-btn'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('wd-test'), 'success');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows error message when mutation throws ApiError', async () => {
    const { ApiError } = await import('@/api/client');
    mockMutateAsync.mockRejectedValue(new ApiError(422, 'Invalid amount', 'VALIDATION_ERROR'));

    renderModal({ open: true, chain: 'bnb' });

    const amountInput = screen.getByTestId('rebalance-amount-input');
    fireEvent.change(amountInput, { target: { value: '999' } });
    fireEvent.click(screen.getByTestId('rebalance-submit-btn'));

    await waitFor(() => {
      expect(screen.getByText(/Invalid amount/i)).toBeDefined();
    });
  });

  it('resets form state when reopened', async () => {
    const qc = makeQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <RebalanceModal open={true} chain="bnb" direction="hot→cold" onClose={vi.fn()} />
      </QueryClientProvider>
    );

    const amountInput = screen.getByTestId('rebalance-amount-input');
    fireEvent.change(amountInput, { target: { value: '777' } });
    expect((amountInput as HTMLInputElement).value).toBe('777');

    // Close then reopen — same QueryClient to avoid provider mismatch
    rerender(
      <QueryClientProvider client={qc}>
        <RebalanceModal open={false} chain="bnb" direction="hot→cold" onClose={vi.fn()} />
      </QueryClientProvider>
    );
    rerender(
      <QueryClientProvider client={qc}>
        <RebalanceModal open={true} chain="bnb" direction="hot→cold" onClose={vi.fn()} />
      </QueryClientProvider>
    );

    expect((screen.getByTestId('rebalance-amount-input') as HTMLInputElement).value).toBe('');
  });
});
