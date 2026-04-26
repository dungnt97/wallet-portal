import { AuthContext } from '@/auth/auth-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewWithdrawalForm } from '../new-withdrawal-form';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockMutateAsync = vi.fn();
const mockReset = vi.fn();

vi.mock('@/api/queries', () => ({
  useColdBalances: vi.fn(() => ({ data: [] })),
  useCreateWithdrawal: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
    reset: mockReset,
    isPending: false,
  })),
}));

vi.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

type SegOption = { value: string; label: string };

vi.mock('@/components/custody', () => ({
  Risk: ({ level }: { level: string }) => <span data-testid={`risk-${level}`} />,
  Segmented: ({
    options,
    value,
    onChange,
  }: { options: SegOption[]; value: string; onChange: (v: string) => void }) => (
    <div>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-testid={`seg-${o.value}`}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  ),
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
        <div>{title}</div>
        <div data-testid="sheet-content">{children}</div>
        <div data-testid="sheet-footer">{footer}</div>
      </div>
    ) : null,
}));

vi.mock('@/icons', () => ({
  I: {
    ChevronLeft: () => <span />,
    AlertTri: () => <span data-testid="icon-alert-tri" />,
    ArrowRight: () => <span />,
  },
}));

vi.mock('@/stores/tweaks-store', () => ({
  useTweaksStore: (selector: (s: { showRiskFlags: boolean }) => unknown) =>
    selector({ showRiskFlags: true }),
}));

vi.mock('@/lib/constants', () => ({
  CHAINS: {
    bnb: { name: 'BNB Chain' },
    sol: { name: 'Solana' },
  },
  MULTISIG_POLICY: { required: 2, total: 3 },
}));

vi.mock('@/lib/format', () => ({
  fmtUSD: (v: number | string) => String(Number(v).toFixed(2)),
  shortHash: (s: string) => `${s.slice(0, 6)}…`,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockStaff = {
  id: 'u1',
  name: 'Alice Chen',
  email: 'a@t.com',
  role: 'admin' as const,
  initials: 'AC',
};

function createQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

type FormProps = { open?: boolean; onClose?: () => void; onSubmit?: (w: unknown) => void };

function renderForm(props: FormProps = {}) {
  const defaultProps = { open: true, onClose: vi.fn(), onSubmit: vi.fn(), ...props };
  const authCtx = {
    staff: mockStaff,
    loading: false,
    initiateLogin: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    hasPerm: vi.fn(() => true),
  };
  return {
    ...defaultProps,
    ...render(
      <QueryClientProvider client={createQC()}>
        <AuthContext.Provider value={authCtx}>
          <NewWithdrawalForm {...defaultProps} />
        </AuthContext.Provider>
      </QueryClientProvider>
    ),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NewWithdrawalForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockReset();
    mockReset.mockReset();
  });

  it('renders sheet when open', () => {
    renderForm();
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
  });

  it('does not render sheet when closed', () => {
    renderForm({ open: false });
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('renders chain selector (bnb / sol)', () => {
    renderForm();
    expect(screen.getByTestId('seg-bnb')).toBeInTheDocument();
    expect(screen.getByTestId('seg-sol')).toBeInTheDocument();
  });

  it('renders token selector (USDT / USDC)', () => {
    renderForm();
    expect(screen.getByTestId('seg-USDT')).toBeInTheDocument();
    expect(screen.getByTestId('seg-USDC')).toBeInTheDocument();
  });

  it('renders amount input', () => {
    renderForm();
    expect(screen.getByLabelText(/amount/i) ?? document.getElementById('wd-amount')).toBeTruthy();
  });

  it('renders destination input', () => {
    renderForm();
    const destInput = document.getElementById('wd-destination') as HTMLInputElement;
    expect(destInput).toBeInTheDocument();
  });

  it('review button is disabled when amount and destination are empty', () => {
    renderForm();
    const footer = screen.getByTestId('sheet-footer');
    const reviewBtn = Array.from(footer.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-accent')
    ) as HTMLButtonElement;
    expect(reviewBtn).toBeDisabled();
  });

  it('review button enabled when amount > 0 and destination set', () => {
    renderForm();
    const amountInput = document.getElementById('wd-amount') as HTMLInputElement;
    const destInput = document.getElementById('wd-destination') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '1000' } });
    fireEvent.change(destInput, { target: { value: '0xDeadBeef1234567890AbCdEf' } });
    const footer = screen.getByTestId('sheet-footer');
    const reviewBtn = Array.from(footer.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-accent')
    ) as HTMLButtonElement;
    expect(reviewBtn).not.toBeDisabled();
  });

  it('advances to review step when review button clicked', () => {
    renderForm();
    fireEvent.change(document.getElementById('wd-amount') as HTMLInputElement, {
      target: { value: '500' },
    });
    fireEvent.change(document.getElementById('wd-destination') as HTMLInputElement, {
      target: { value: '0xDest1234567890' },
    });
    const footer = screen.getByTestId('sheet-footer');
    const reviewBtn = Array.from(footer.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-accent')
    ) as HTMLButtonElement;
    fireEvent.click(reviewBtn);
    const newFooter = screen.getByTestId('sheet-footer');
    const submitBtn = Array.from(newFooter.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-accent')
    );
    expect(submitBtn).toBeInTheDocument();
  });

  it('calls mutateAsync on submit', async () => {
    mockMutateAsync.mockResolvedValue({
      withdrawal: { id: 'new-1', createdAt: new Date().toISOString() },
      multisigOpId: 'op-1',
    });
    renderForm();
    fireEvent.change(document.getElementById('wd-amount') as HTMLInputElement, {
      target: { value: '500' },
    });
    fireEvent.change(document.getElementById('wd-destination') as HTMLInputElement, {
      target: { value: '0xDest1234567890' },
    });
    const footer = screen.getByTestId('sheet-footer');
    const reviewBtn = Array.from(footer.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-accent')
    ) as HTMLButtonElement;
    fireEvent.click(reviewBtn);
    const newFooter = screen.getByTestId('sheet-footer');
    const submitBtn = Array.from(newFooter.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-accent')
    ) as HTMLButtonElement;
    fireEvent.click(submitBtn);
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
  });

  it('calls onSubmit with shaped withdrawal row on success', async () => {
    const onSubmit = vi.fn();
    mockMutateAsync.mockResolvedValue({
      withdrawal: { id: 'new-1', createdAt: new Date().toISOString() },
      multisigOpId: 'op-1',
    });
    renderForm({ onSubmit });
    fireEvent.change(document.getElementById('wd-amount') as HTMLInputElement, {
      target: { value: '500' },
    });
    fireEvent.change(document.getElementById('wd-destination') as HTMLInputElement, {
      target: { value: '0xDest1234567890' },
    });
    const footer = screen.getByTestId('sheet-footer');
    const reviewBtn = Array.from(footer.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-accent')
    ) as HTMLButtonElement;
    fireEvent.click(reviewBtn);
    const newFooter = screen.getByTestId('sheet-footer');
    const submitBtn = Array.from(newFooter.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-accent')
    ) as HTMLButtonElement;
    fireEvent.click(submitBtn);
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ chain: 'bnb', token: 'USDT' })
      )
    );
  });

  it('shows API error when mutateAsync rejects', async () => {
    const { ApiError } = await import('@/api/client');
    mockMutateAsync.mockRejectedValue(new ApiError(422, 'Insufficient balance'));
    renderForm();
    fireEvent.change(document.getElementById('wd-amount') as HTMLInputElement, {
      target: { value: '999999' },
    });
    fireEvent.change(document.getElementById('wd-destination') as HTMLInputElement, {
      target: { value: '0xDest1234567890' },
    });
    const footer = screen.getByTestId('sheet-footer');
    const reviewBtn = Array.from(footer.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-accent')
    ) as HTMLButtonElement;
    fireEvent.click(reviewBtn);
    const newFooter = screen.getByTestId('sheet-footer');
    const submitBtn = Array.from(newFooter.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-accent')
    ) as HTMLButtonElement;
    fireEvent.click(submitBtn);
    await waitFor(() => {
      const alert = document.querySelector('.alert.err');
      expect(alert).toBeInTheDocument();
    });
  });

  it('switching chain changes destination placeholder', () => {
    renderForm();
    fireEvent.click(screen.getByTestId('seg-sol'));
    const destInput = document.getElementById('wd-destination') as HTMLInputElement;
    expect(destInput.placeholder).toBe('Solana address');
  });

  it('shows risk indicator for destination with > 30 chars starting with 0x4', () => {
    renderForm();
    const destInput = document.getElementById('wd-destination') as HTMLInputElement;
    fireEvent.change(destInput, { target: { value: '0x4aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } });
    expect(screen.getByTestId('risk-med')).toBeInTheDocument();
  });

  it('back button on step 2 returns to step 1', () => {
    renderForm();
    fireEvent.change(document.getElementById('wd-amount') as HTMLInputElement, {
      target: { value: '100' },
    });
    fireEvent.change(document.getElementById('wd-destination') as HTMLInputElement, {
      target: { value: '0xDest' },
    });
    const footer = screen.getByTestId('sheet-footer');
    const reviewBtn = Array.from(footer.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-accent')
    ) as HTMLButtonElement;
    fireEvent.click(reviewBtn);
    const newFooter = screen.getByTestId('sheet-footer');
    const backBtn = Array.from(newFooter.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-ghost')
    ) as HTMLButtonElement;
    fireEvent.click(backBtn);
    expect(screen.getByTestId('seg-bnb')).toBeInTheDocument();
  });

  it('resets form state when re-opened', () => {
    const { rerender } = renderForm({ open: false });
    rerender(
      <QueryClientProvider client={createQC()}>
        <AuthContext.Provider
          value={{
            staff: mockStaff,
            loading: false,
            initiateLogin: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn(),
            hasPerm: vi.fn(() => true),
          }}
        >
          <NewWithdrawalForm open={true} onClose={vi.fn()} onSubmit={vi.fn()} />
        </AuthContext.Provider>
      </QueryClientProvider>
    );
    const amountInput = document.getElementById('wd-amount') as HTMLInputElement;
    expect(amountInput?.value ?? '').toBe('');
  });
});
