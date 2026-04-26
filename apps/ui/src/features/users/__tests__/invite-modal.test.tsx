// Tests for features/users/invite-modal.tsx — InviteModal staff invitation form and success state.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InviteModal } from '../invite-modal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockMutate = vi.fn();
const mockUseInvite = vi.fn(() => ({
  mutate: mockMutate,
  isPending: false,
  isError: false,
  error: null,
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => mockUseInvite(),
}));

vi.mock('@/api/client', () => ({
  api: { post: vi.fn() },
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
        <div data-testid="footer">{footer}</div>
        <button type="button" data-testid="modal-close" onClick={onClose}>
          X
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/overlays/toast-host', () => ({
  useToast: () => vi.fn(),
}));

vi.mock('@/icons', () => ({
  I: {
    Check: () => <span data-testid="icon-check" />,
    Copy: () => <span data-testid="icon-copy" />,
    Clock: () => <span data-testid="icon-clock" />,
    Shield: () => <span data-testid="icon-shield" />,
  },
}));

vi.mock('@/lib/constants', () => ({
  ROLES: {
    admin: { id: 'admin', label: 'Admin' },
    treasurer: { id: 'treasurer', label: 'Treasurer' },
    operator: { id: 'operator', label: 'Operator' },
    viewer: { id: 'viewer', label: 'Viewer' },
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InviteModal', () => {
  it('renders nothing when closed', () => {
    render(<InviteModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders the form when open', () => {
    render(<InviteModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders name input', () => {
    render(<InviteModal open={true} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('Jordan Lee')).toBeInTheDocument();
  });

  it('renders email input', () => {
    render(<InviteModal open={true} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('jordan@treasury.io')).toBeInTheDocument();
  });

  it('renders role select with all options', () => {
    render(<InviteModal open={true} onClose={vi.fn()} />);
    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option'));
    expect(options.map((o) => o.value)).toEqual(['admin', 'treasurer', 'operator', 'viewer']);
  });

  it('disables send button when email and name are empty', () => {
    render(<InviteModal open={true} onClose={vi.fn()} />);
    const sendBtn = screen.getByText('users.sendInvite').closest('button') as HTMLElement;
    expect(sendBtn).toBeDisabled();
  });

  it('disables send button when only name is filled', async () => {
    const user = userEvent.setup();
    render(<InviteModal open={true} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Jordan Lee'), 'Alice');
    const sendBtn = screen.getByText('users.sendInvite').closest('button') as HTMLElement;
    expect(sendBtn).toBeDisabled();
  });

  it('enables send button when both name and email are filled', async () => {
    const user = userEvent.setup();
    render(<InviteModal open={true} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Jordan Lee'), 'Alice');
    await user.type(screen.getByPlaceholderText('jordan@treasury.io'), 'alice@co.com');
    const sendBtn = screen.getByText('users.sendInvite').closest('button') as HTMLElement;
    expect(sendBtn).not.toBeDisabled();
  });

  it('calls mutate with email, name, role on submit', async () => {
    const user = userEvent.setup();
    render(<InviteModal open={true} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Jordan Lee'), 'Alice');
    await user.type(screen.getByPlaceholderText('jordan@treasury.io'), 'alice@co.com');
    await user.click(screen.getByText('users.sendInvite').closest('button') as HTMLElement);
    expect(mockMutate).toHaveBeenCalledWith(
      { email: 'alice@co.com', name: 'Alice', role: 'operator' },
      expect.any(Object)
    );
  });

  it('shows error panel when mutation has error', () => {
    mockUseInvite.mockReturnValueOnce({
      mutate: mockMutate,
      isPending: false,
      isError: true,
      error: new Error('Email already in use'),
    });
    render(<InviteModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Email already in use')).toBeInTheDocument();
  });

  it('shows invite link after successful submission', async () => {
    let capturedOnSuccess: ((r: unknown) => void) | undefined;
    mockUseInvite.mockReturnValue({
      mutate: vi.fn((_body: unknown, opts: { onSuccess?: (r: unknown) => void }) => {
        capturedOnSuccess = opts.onSuccess;
      }),
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    render(<InviteModal open={true} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Jordan Lee'), 'Bob');
    await user.type(screen.getByPlaceholderText('jordan@treasury.io'), 'bob@co.com');
    await user.click(screen.getByText('users.sendInvite').closest('button') as HTMLElement);

    act(() => {
      capturedOnSuccess?.({
        staffId: 's-1',
        inviteLink: 'https://app.example.com/invite/abc123',
        expiresAt: '2099-01-01T00:00:00Z',
      });
    });

    expect(await screen.findByText('https://app.example.com/invite/abc123')).toBeInTheDocument();
  });

  it('shows done button in success state', async () => {
    let capturedOnSuccess: ((r: unknown) => void) | undefined;
    mockUseInvite.mockReturnValue({
      mutate: vi.fn((_body: unknown, opts: { onSuccess?: (r: unknown) => void }) => {
        capturedOnSuccess = opts.onSuccess;
      }),
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    render(<InviteModal open={true} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Jordan Lee'), 'Bob');
    await user.type(screen.getByPlaceholderText('jordan@treasury.io'), 'bob@co.com');
    await user.click(screen.getByText('users.sendInvite').closest('button') as HTMLElement);

    act(() => {
      capturedOnSuccess?.({
        staffId: 's-1',
        inviteLink: 'https://app.example.com/invite/xyz',
        expiresAt: '2099-01-01T00:00:00Z',
      });
    });

    expect(await screen.findByText('common.done')).toBeInTheDocument();
  });

  it('calls onClose when cancel is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<InviteModal open={true} onClose={onClose} />);
    await user.click(screen.getByText('common.cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
