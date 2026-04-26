// Tests for features/users/risk-edit.tsx — RiskBadge display + RiskEditModal form.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RiskBadge, RiskEditModal } from '../risk-edit';

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
  api: { patch: vi.fn() },
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

// ── RiskBadge tests ───────────────────────────────────────────────────────────

describe('RiskBadge', () => {
  it('renders the tier label from i18n key', () => {
    render(<RiskBadge tier="low" />);
    expect(screen.getByText(/users\.riskBadge\.low/)).toBeInTheDocument();
  });

  it('renders medium tier', () => {
    render(<RiskBadge tier="medium" />);
    expect(screen.getByText(/users\.riskBadge\.medium/)).toBeInTheDocument();
  });

  it('renders high tier', () => {
    render(<RiskBadge tier="high" />);
    expect(screen.getByText(/users\.riskBadge\.high/)).toBeInTheDocument();
  });

  it('renders frozen tier with lock emoji', () => {
    render(<RiskBadge tier="frozen" />);
    const el = screen.getByText(/users\.riskBadge\.frozen/);
    expect(el.textContent).toContain('🔒');
  });

  it('renders dot for non-frozen tiers', () => {
    render(<RiskBadge tier="low" />);
    const el = screen.getByText(/users\.riskBadge\.low/);
    expect(el.textContent).toContain('●');
  });
});

// ── RiskEditModal tests ───────────────────────────────────────────────────────

describe('RiskEditModal', () => {
  it('renders nothing when closed', () => {
    render(<RiskEditModal userId="u-1" currentTier="low" open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders modal when open', () => {
    render(<RiskEditModal userId="u-1" currentTier="low" open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders tier select with all options', () => {
    render(<RiskEditModal userId="u-1" currentTier="low" open={true} onClose={vi.fn()} />);
    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option'));
    expect(options.map((o) => o.value)).toEqual(['low', 'medium', 'high', 'frozen']);
  });

  it('initialises tier select to currentTier', () => {
    render(<RiskEditModal userId="u-1" currentTier="medium" open={true} onClose={vi.fn()} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('medium');
  });

  it('renders reason textarea', () => {
    render(<RiskEditModal userId="u-1" currentTier="low" open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('disables save button when reason is empty', () => {
    render(<RiskEditModal userId="u-1" currentTier="low" open={true} onClose={vi.fn()} />);
    const saveBtn = screen.getByText('users.riskEdit.save').closest('button') as HTMLElement;
    expect(saveBtn).toBeDisabled();
  });

  it('enables save button when reason has text', async () => {
    const user = userEvent.setup();
    render(<RiskEditModal userId="u-1" currentTier="low" open={true} onClose={vi.fn()} />);
    await user.type(screen.getByRole('textbox'), 'Suspicious activity');
    const saveBtn = screen.getByText('users.riskEdit.save').closest('button') as HTMLElement;
    expect(saveBtn).not.toBeDisabled();
  });

  it('shows frozen warning when tier is switched to frozen', async () => {
    const user = userEvent.setup();
    render(<RiskEditModal userId="u-1" currentTier="low" open={true} onClose={vi.fn()} />);
    await user.selectOptions(screen.getByRole('combobox'), 'frozen');
    expect(screen.getByText(/Freezing this user/)).toBeInTheDocument();
  });

  it('does not show frozen warning for non-frozen tier', () => {
    render(<RiskEditModal userId="u-1" currentTier="high" open={true} onClose={vi.fn()} />);
    expect(screen.queryByText(/Freezing this user/)).not.toBeInTheDocument();
  });

  it('calls mutate with tier and reason on save', async () => {
    const user = userEvent.setup();
    render(<RiskEditModal userId="u-1" currentTier="low" open={true} onClose={vi.fn()} />);
    await user.type(screen.getByRole('textbox'), 'AML check failed');
    await user.click(screen.getByText('users.riskEdit.save').closest('button') as HTMLElement);
    expect(mockMutate).toHaveBeenCalledWith(
      { tier: 'low', reason: 'AML check failed' },
      expect.any(Object)
    );
  });

  it('shows error panel when mutation has error', () => {
    mockUseMutation.mockReturnValueOnce({
      mutate: mockMutate,
      isPending: false,
      isError: true,
      error: new Error('Unauthorised'),
    });
    render(<RiskEditModal userId="u-1" currentTier="low" open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Unauthorised')).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RiskEditModal userId="u-1" currentTier="low" open={true} onClose={onClose} />);
    await user.click(screen.getByText('common.cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
