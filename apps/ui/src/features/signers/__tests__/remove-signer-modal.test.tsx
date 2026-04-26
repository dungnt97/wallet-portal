// Tests for features/signers/remove-signer-modal.tsx — remove treasurer modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveSignerModal } from '../remove-signer-modal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/components/overlays/toast-host', () => ({
  useToast: () => vi.fn(),
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

const mockUseStaff = vi.fn();
const mockUseRemoveSigner = vi.fn();

vi.mock('@/api/signer-ceremony-queries', () => ({
  useStaff: () => mockUseStaff(),
  useRemoveSigner: () => mockUseRemoveSigner(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStaff(id: string, name: string, email: string) {
  return { id, name, email, status: 'active' as const, role: 'treasurer' as const };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RemoveSignerModal', () => {
  beforeEach(() => {
    mockUseRemoveSigner.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it('shows loading text while staff is loading', () => {
    mockUseStaff.mockReturnValue({ data: [], isPending: true });
    render(<RemoveSignerModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('renders staff select when loaded', () => {
    mockUseStaff.mockReturnValue({
      data: [makeStaff('s1', 'Alice', 'alice@example.com')],
      isPending: false,
    });
    render(<RemoveSignerModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('lists treasurer options in select', () => {
    mockUseStaff.mockReturnValue({
      data: [
        makeStaff('s1', 'Alice Adams', 'alice@example.com'),
        makeStaff('s2', 'Bob Baker', 'bob@example.com'),
      ],
      isPending: false,
    });
    render(<RemoveSignerModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Alice Adams/)).toBeInTheDocument();
    expect(screen.getByText(/Bob Baker/)).toBeInTheDocument();
  });

  it('does not list non-treasurer staff', () => {
    mockUseStaff.mockReturnValue({
      data: [
        makeStaff('s1', 'Alice Adams', 'alice@example.com'),
        { id: 's2', name: 'Charlie', email: 'c@example.com', status: 'active', role: 'admin' },
      ],
      isPending: false,
    });
    render(<RemoveSignerModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByText(/Charlie/)).not.toBeInTheDocument();
  });

  it('submit button is disabled when no signer selected', () => {
    mockUseStaff.mockReturnValue({
      data: [
        makeStaff('s1', 'Alice', 'alice@example.com'),
        makeStaff('s2', 'Bob', 'bob@example.com'),
        makeStaff('s3', 'Carol', 'carol@example.com'),
      ],
      isPending: false,
    });
    render(<RemoveSignerModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    const submitBtn = screen.getByText('signers.remove.submit').closest('button') as HTMLElement;
    expect(submitBtn).toBeDisabled();
  });

  it('shows below-threshold error when only 2 treasurers and one would be removed', async () => {
    const user = userEvent.setup();
    mockUseStaff.mockReturnValue({
      data: [
        makeStaff('s1', 'Alice Adams', 'alice@example.com'),
        makeStaff('s2', 'Bob Baker', 'bob@example.com'),
      ],
      isPending: false,
    });
    render(<RemoveSignerModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.selectOptions(screen.getByRole('combobox'), 's1');
    expect(screen.getByText('signers.remove.belowThresholdTitle')).toBeInTheDocument();
  });

  it('shows shrink warning when set stays above threshold', async () => {
    const user = userEvent.setup();
    mockUseStaff.mockReturnValue({
      data: [
        makeStaff('s1', 'Alice', 'alice@example.com'),
        makeStaff('s2', 'Bob', 'bob@example.com'),
        makeStaff('s3', 'Carol', 'carol@example.com'),
      ],
      isPending: false,
    });
    render(<RemoveSignerModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.selectOptions(screen.getByRole('combobox'), 's1');
    expect(screen.getByText('signers.remove.shrinkTitle')).toBeInTheDocument();
  });

  it('shows selected signer avatar card after selection', async () => {
    const user = userEvent.setup();
    mockUseStaff.mockReturnValue({
      data: [
        makeStaff('s1', 'Alice Adams', 'alice@example.com'),
        makeStaff('s2', 'Bob Baker', 'bob@example.com'),
        makeStaff('s3', 'Carol Clark', 'carol@example.com'),
      ],
      isPending: false,
    });
    render(<RemoveSignerModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.selectOptions(screen.getByRole('combobox'), 's1');
    expect(screen.getByText('Alice Adams')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('disables submit when below-threshold even with reason', async () => {
    const user = userEvent.setup();
    mockUseStaff.mockReturnValue({
      data: [
        makeStaff('s1', 'Alice', 'alice@example.com'),
        makeStaff('s2', 'Bob', 'bob@example.com'),
      ],
      isPending: false,
    });
    render(<RemoveSignerModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.selectOptions(screen.getByRole('combobox'), 's1');
    await user.type(screen.getByRole('textbox'), 'offboarding Alice from the team');
    const submitBtn = screen.getByText('signers.remove.submit').closest('button') as HTMLElement;
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit when signer selected, reason provided, set above threshold', async () => {
    const user = userEvent.setup();
    mockUseStaff.mockReturnValue({
      data: [
        makeStaff('s1', 'Alice', 'alice@example.com'),
        makeStaff('s2', 'Bob', 'bob@example.com'),
        makeStaff('s3', 'Carol', 'carol@example.com'),
      ],
      isPending: false,
    });
    render(<RemoveSignerModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.selectOptions(screen.getByRole('combobox'), 's1');
    await user.type(screen.getByRole('textbox'), 'offboarding Alice');
    const submitBtn = screen.getByText('signers.remove.submit').closest('button') as HTMLElement;
    expect(submitBtn).not.toBeDisabled();
  });

  it('calls mutateAsync with selected id and reason on submit', async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue({ ceremonyId: 'cer1' });
    mockUseRemoveSigner.mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false });
    const user = userEvent.setup();
    mockUseStaff.mockReturnValue({
      data: [
        makeStaff('s1', 'Alice', 'alice@example.com'),
        makeStaff('s2', 'Bob', 'bob@example.com'),
        makeStaff('s3', 'Carol', 'carol@example.com'),
      ],
      isPending: false,
    });
    render(<RemoveSignerModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.selectOptions(screen.getByRole('combobox'), 's1');
    await user.type(screen.getByRole('textbox'), 'offboarding Alice');
    await user.click(screen.getByText('signers.remove.submit').closest('button') as HTMLElement);
    expect(mockMutateAsync).toHaveBeenCalledWith({
      targetStaffId: 's1',
      reason: 'offboarding Alice',
    });
  });

  it('calls onSuccess with ceremonyId after submit', async () => {
    const onSuccess = vi.fn();
    const mockMutateAsync = vi.fn().mockResolvedValue({ ceremonyId: 'cer-xyz' });
    mockUseRemoveSigner.mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false });
    const user = userEvent.setup();
    mockUseStaff.mockReturnValue({
      data: [
        makeStaff('s1', 'Alice', 'alice@example.com'),
        makeStaff('s2', 'Bob', 'bob@example.com'),
        makeStaff('s3', 'Carol', 'carol@example.com'),
      ],
      isPending: false,
    });
    render(<RemoveSignerModal onClose={vi.fn()} onSuccess={onSuccess} />);
    await user.selectOptions(screen.getByRole('combobox'), 's1');
    await user.type(screen.getByRole('textbox'), 'offboarding Alice');
    await user.click(screen.getByText('signers.remove.submit').closest('button') as HTMLElement);
    expect(onSuccess).toHaveBeenCalledWith('cer-xyz');
  });

  it('calls onClose when cancel button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    mockUseStaff.mockReturnValue({ data: [], isPending: false });
    render(<RemoveSignerModal onClose={onClose} onSuccess={vi.fn()} />);
    await user.click(screen.getByText('common.cancel').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
