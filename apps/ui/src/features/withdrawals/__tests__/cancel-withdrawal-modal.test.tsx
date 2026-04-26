import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelWithdrawalModal } from '../cancel-withdrawal-modal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockMutateAsync = vi.fn();
const mockReset = vi.fn();

vi.mock('@/api/queries', () => ({
  useCancelWithdrawal: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
    reset: mockReset,
    isPending: false,
  })),
}));

vi.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('@/components/overlays', () => ({
  Sheet: ({
    open,
    children,
    footer,
    title,
  }: { open: boolean; children: React.ReactNode; footer: React.ReactNode; title: string }) =>
    open ? (
      <div data-testid="sheet">
        <div data-testid="sheet-title">{title}</div>
        <div>{children}</div>
        <div data-testid="sheet-footer">{footer}</div>
      </div>
    ) : null,
  useToast: () => vi.fn(),
}));

vi.mock('@/icons', () => ({
  I: {
    AlertTri: () => <span data-testid="icon-alert-tri" />,
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function createQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderModal(
  props: Partial<{ open: boolean; withdrawalId: string | null; onClose: () => void }> = {}
) {
  const defaultProps = {
    open: true,
    withdrawalId: 'wd-001',
    onClose: vi.fn(),
    ...props,
  };
  return {
    onClose: defaultProps.onClose,
    ...render(
      <QueryClientProvider client={createQC()}>
        <CancelWithdrawalModal {...defaultProps} />
      </QueryClientProvider>
    ),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CancelWithdrawalModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockReset();
    mockReset.mockReset();
  });

  it('renders sheet when open=true', () => {
    renderModal();
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
  });

  it('does not render sheet when open=false', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('renders the reason textarea', () => {
    renderModal();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('confirm button is disabled when reason is empty', () => {
    renderModal();
    const footer = screen.getByTestId('sheet-footer');
    const confirmBtn = footer.querySelector('button:not(.btn-ghost)') as HTMLButtonElement;
    expect(confirmBtn).toBeDisabled();
  });

  it('confirm button is disabled when reason is < 3 chars', () => {
    renderModal();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'ab' } });
    const footer = screen.getByTestId('sheet-footer');
    const confirmBtn = footer.querySelector('button:not(.btn-ghost)') as HTMLButtonElement;
    expect(confirmBtn).toBeDisabled();
  });

  it('confirm button is enabled when reason has >= 3 chars', () => {
    renderModal();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'bad address' } });
    const footer = screen.getByTestId('sheet-footer');
    const confirmBtn = footer.querySelector('button:not(.btn-ghost)') as HTMLButtonElement;
    expect(confirmBtn).not.toBeDisabled();
  });

  it('calls mutateAsync with reason on confirm', async () => {
    mockMutateAsync.mockResolvedValue(undefined);
    const { onClose } = renderModal();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Wrong destination' } });
    const footer = screen.getByTestId('sheet-footer');
    const confirmBtn = footer.querySelector('button:not(.btn-ghost)') as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({ reason: 'Wrong destination' })
    );
  });

  it('calls onClose after successful cancellation', async () => {
    mockMutateAsync.mockResolvedValue(undefined);
    const { onClose } = renderModal();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Wrong destination' } });
    const footer = screen.getByTestId('sheet-footer');
    const confirmBtn = footer.querySelector('button:not(.btn-ghost)') as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows API error when mutateAsync rejects with ApiError', async () => {
    const { ApiError } = await import('@/api/client');
    mockMutateAsync.mockRejectedValue(new ApiError('Policy violation', 422));
    renderModal();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'bad reason here' } });
    const footer = screen.getByTestId('sheet-footer');
    const confirmBtn = footer.querySelector('button:not(.btn-ghost)') as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      const alert = document.querySelector('.alert.err');
      expect(alert).toBeInTheDocument();
    });
  });

  it('shows error when mutateAsync rejects with generic error', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network error'));
    renderModal();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'some reason text' } });
    const footer = screen.getByTestId('sheet-footer');
    const confirmBtn = footer.querySelector('button:not(.btn-ghost)') as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      const alert = document.querySelector('.alert.err');
      expect(alert).toBeInTheDocument();
    });
  });

  it('calls onClose when back button clicked', () => {
    const { onClose } = renderModal();
    const footer = screen.getByTestId('sheet-footer');
    const backBtn = footer.querySelector('.btn-ghost') as HTMLButtonElement;
    fireEvent.click(backBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('resets reason and error when re-opened', () => {
    const { rerender } = renderModal({ open: false });
    rerender(
      <QueryClientProvider client={createQC()}>
        <CancelWithdrawalModal open={true} withdrawalId="wd-001" onClose={vi.fn()} />
      </QueryClientProvider>
    );
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('does not call mutateAsync when withdrawalId is null', async () => {
    renderModal({ withdrawalId: null });
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'some reason' } });
    const footer = screen.getByTestId('sheet-footer');
    const confirmBtn = footer.querySelector('button:not(.btn-ghost)') as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    // mutateAsync should not be called when withdrawalId is null
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
