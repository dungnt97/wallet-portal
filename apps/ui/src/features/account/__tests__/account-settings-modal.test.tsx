// Tests for features/account/account-settings-modal.tsx — profile update + logout-all modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountSettingsModal } from '../account-settings-modal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockRefresh = vi.fn().mockResolvedValue(undefined);
const mockLogout = vi.fn();

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({
    staff: { name: 'Alice Admin', email: 'alice@example.com', role: 'admin' },
    refresh: mockRefresh,
    logout: mockLogout,
  }),
}));

vi.mock('@/components/overlays/toast-host', () => ({
  useToast: () => vi.fn(),
}));

vi.mock('@/api/client', () => ({
  api: { patch: vi.fn(), post: vi.fn() },
}));

const mockUpdateMutate = vi.fn();
const mockLogoutAllMutate = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi
    .fn()
    .mockImplementationOnce(() => ({
      mutate: mockUpdateMutate,
      isPending: false,
      isError: false,
    }))
    .mockImplementation(() => ({
      mutate: mockLogoutAllMutate,
      isPending: false,
      isError: false,
    })),
}));

vi.mock('@/icons', () => ({
  I: {
    Shield: () => <span data-testid="icon-shield" />,
    External: () => <span data-testid="icon-external" />,
    LogOut: () => <span data-testid="icon-logout" />,
  },
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AccountSettingsModal', () => {
  it('renders nothing when closed', () => {
    render(<AccountSettingsModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders modal when open', () => {
    render(<AccountSettingsModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders name input pre-filled with staff name', () => {
    render(<AccountSettingsModal open={true} onClose={vi.fn()} />);
    const nameInput = screen.getByPlaceholderText('Full name') as HTMLInputElement;
    expect(nameInput.value).toBe('Alice Admin');
  });

  it('renders email input as read-only with staff email', () => {
    render(<AccountSettingsModal open={true} onClose={vi.fn()} />);
    const emailInput = screen.getByDisplayValue('alice@example.com') as HTMLInputElement;
    expect(emailInput).toHaveAttribute('readonly');
  });

  it('renders locale select', () => {
    render(<AccountSettingsModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders Google account password link', () => {
    render(<AccountSettingsModal open={true} onClose={vi.fn()} />);
    const link = screen.getByRole('link', { name: 'account.changePasswordLink' });
    expect(link).toHaveAttribute('href', 'https://myaccount.google.com/security');
  });

  it('renders logout-all button', () => {
    render(<AccountSettingsModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('account.logoutAll')).toBeInTheDocument();
  });

  it('save button is disabled when name is unchanged and locale is en', () => {
    render(<AccountSettingsModal open={true} onClose={vi.fn()} />);
    const saveBtn = screen.getByText('common.save').closest('button') as HTMLElement;
    expect(saveBtn).toBeDisabled();
  });

  it('save button enables when name is changed', async () => {
    const user = userEvent.setup();
    render(<AccountSettingsModal open={true} onClose={vi.fn()} />);
    const nameInput = screen.getByPlaceholderText('Full name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Bob Updated');
    const saveBtn = screen.getByText('common.save').closest('button') as HTMLElement;
    expect(saveBtn).not.toBeDisabled();
  });

  it('save button enables when locale is changed to vi', async () => {
    const user = userEvent.setup();
    render(<AccountSettingsModal open={true} onClose={vi.fn()} />);
    await user.selectOptions(screen.getByRole('combobox'), 'vi');
    const saveBtn = screen.getByText('common.save').closest('button') as HTMLElement;
    expect(saveBtn).not.toBeDisabled();
  });

  it('calls onClose when cancel is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AccountSettingsModal open={true} onClose={onClose} />);
    await user.click(screen.getByText('common.cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
