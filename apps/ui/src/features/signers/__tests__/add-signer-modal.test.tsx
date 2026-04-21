// Vitest component tests for AddSignerModal.
// Covers: renders staff picker, disables submit when reason empty,
// calls addSigner mutation on submit, shows error toast on failure.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockMutateAsync = vi.fn();
const mockToast = vi.fn();

vi.mock('@/api/signer-ceremony-queries', () => ({
  useAddSigner: vi.fn(),
  useStaff: vi.fn(),
}));

vi.mock('@/components/overlays/toast-host', () => ({
  useToast: () => mockToast,
}));

import { useAddSigner, useStaff } from '@/api/signer-ceremony-queries';
import { AddSignerModal } from '../add-signer-modal';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_CANDIDATE = {
  id: 'staff-uuid-001',
  name: 'Alice Test',
  email: 'alice@treasury.io',
  role: 'staff',
  status: 'active',
  lastLoginAt: null,
  createdAt: new Date().toISOString(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={makeQC()}>{children}</QueryClientProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AddSignerModal', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();

    vi.mocked(useStaff).mockReturnValue({
      data: [STAFF_CANDIDATE],
      isPending: false,
      isError: false,
    } as ReturnType<typeof useStaff>);

    vi.mocked(useAddSigner).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isError: false,
      isSuccess: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useAddSigner>);
  });

  it('renders staff picker with candidate', () => {
    render(
      <Wrapper>
        <AddSignerModal onClose={onClose} onSuccess={onSuccess} />
      </Wrapper>
    );

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText(/Alice Test/)).toBeInTheDocument();
  });

  it('submit button is disabled when no staff selected', () => {
    render(
      <Wrapper>
        <AddSignerModal onClose={onClose} onSuccess={onSuccess} />
      </Wrapper>
    );

    const submitBtn = screen.getByRole('button', { name: /start add ceremony/i });
    expect(submitBtn).toBeDisabled();
  });

  it('submit button is disabled when staff selected but reason empty', () => {
    render(
      <Wrapper>
        <AddSignerModal onClose={onClose} onSuccess={onSuccess} />
      </Wrapper>
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: STAFF_CANDIDATE.id } });

    const submitBtn = screen.getByRole('button', { name: /start add ceremony/i });
    expect(submitBtn).toBeDisabled();
  });

  it('calls mutateAsync with correct payload and invokes onSuccess', async () => {
    const ceremonyId = 'cer-uuid-001';
    mockMutateAsync.mockResolvedValueOnce({
      ceremonyId,
      bnbOpId: 'op-bnb',
      solanaOpId: 'op-sol',
    });

    render(
      <Wrapper>
        <AddSignerModal onClose={onClose} onSuccess={onSuccess} />
      </Wrapper>
    );

    // Select staff
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: STAFF_CANDIDATE.id } });

    // Enter reason
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Onboarding new treasurer' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /start add ceremony/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        targetStaffId: STAFF_CANDIDATE.id,
        reason: 'Onboarding new treasurer',
      });
      expect(onSuccess).toHaveBeenCalledWith(ceremonyId);
    });
  });

  it('shows error toast when mutation rejects', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('Signing key missing'));

    render(
      <Wrapper>
        <AddSignerModal onClose={onClose} onSuccess={onSuccess} />
      </Wrapper>
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: STAFF_CANDIDATE.id } });

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'test reason' } });

    fireEvent.click(screen.getByRole('button', { name: /start add ceremony/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Signing key missing', 'error');
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  it('shows loading state when no staff candidates', () => {
    vi.mocked(useStaff).mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    } as ReturnType<typeof useStaff>);

    render(
      <Wrapper>
        <AddSignerModal onClose={onClose} onSuccess={onSuccess} />
      </Wrapper>
    );

    expect(screen.getByText(/no eligible staff/i)).toBeInTheDocument();
  });

  it('calls onClose when cancel is clicked', () => {
    render(
      <Wrapper>
        <AddSignerModal onClose={onClose} onSuccess={onSuccess} />
      </Wrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
