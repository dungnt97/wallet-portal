import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddUserModal } from '../users-modals';

const mockMutate = vi.fn();
const mockUseCreateUser = vi.fn(() => ({
  mutate: mockMutate,
  isPending: false,
  isError: false,
  error: null as Error | null,
}));

vi.mock('@/api/users', () => ({
  useCreateUser: () => mockUseCreateUser(),
}));

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}

vi.mock('@/components/overlays', () => ({
  Modal: ({ open, onClose, title, children, footer }: ModalProps) =>
    open ? (
      // biome-ignore lint/a11y/useKeyWithClickEvents: test-only mock div
      <div data-testid="modal" onClick={onClose}>
        <h2>{title}</h2>
        {children}
        <div data-testid="modal-footer">{footer}</div>
      </div>
    ) : null,
  useToast: () => vi.fn(),
}));

vi.mock('@/icons', () => ({
  I: {
    Lightning: () => <span data-testid="icon-lightning" />,
  },
}));

describe('AddUserModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateUser.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
      error: null,
    });
  });

  it('does not render when closed', () => {
    const mockClose = vi.fn();
    const { queryByTestId } = render(<AddUserModal open={false} onClose={mockClose} />);

    expect(queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders when open', () => {
    const mockClose = vi.fn();
    render(<AddUserModal open={true} onClose={mockClose} />);

    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders email input field', () => {
    const mockClose = vi.fn();
    render(<AddUserModal open={true} onClose={mockClose} />);

    const input = screen.getByRole('textbox', { name: /email/i });
    expect(input).toBeInTheDocument();
  });

  it('renders KYC tier select dropdown', () => {
    const mockClose = vi.fn();
    render(<AddUserModal open={true} onClose={mockClose} />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
  });

  it('updates email on input change', async () => {
    const mockClose = vi.fn();
    const user = userEvent.setup();
    render(<AddUserModal open={true} onClose={mockClose} />);

    const input = screen.getByRole('textbox', { name: /email/i }) as HTMLInputElement;
    await user.type(input, 'test@example.com');

    expect(input.value).toBe('test@example.com');
  });

  it('renders KYC tier select with options', () => {
    const mockClose = vi.fn();
    render(<AddUserModal open={true} onClose={mockClose} />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThanOrEqual(3);
  });

  it('calls onClose when cancel button is clicked', async () => {
    const mockClose = vi.fn();
    const user = userEvent.setup();
    render(<AddUserModal open={true} onClose={mockClose} />);

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelBtn);

    expect(mockClose).toHaveBeenCalled();
  });

  it('disables create button when email is empty', () => {
    const mockClose = vi.fn();
    render(<AddUserModal open={true} onClose={mockClose} />);

    const createBtn = screen.getByRole('button', { name: /create/i });
    expect(createBtn).toBeDisabled();
  });

  it('enables create button when email is filled', async () => {
    const mockClose = vi.fn();
    const user = userEvent.setup();
    render(<AddUserModal open={true} onClose={mockClose} />);

    const input = screen.getByRole('textbox', { name: /email/i });
    await user.type(input, 'test@example.com');

    const createBtn = screen.getByRole('button', { name: /create/i });
    expect(createBtn).not.toBeDisabled();
  });

  it('renders info hint with icon', () => {
    const mockClose = vi.fn();
    render(<AddUserModal open={true} onClose={mockClose} />);

    expect(screen.getByTestId('icon-lightning')).toBeInTheDocument();
  });

  it('renders KYC tier options', () => {
    const mockClose = vi.fn();
    render(<AddUserModal open={true} onClose={mockClose} />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThanOrEqual(3); // none, basic, enhanced
  });

  it('shows all input fields in modal', () => {
    const mockClose = vi.fn();
    render(<AddUserModal open={true} onClose={mockClose} />);

    // Email field
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    // KYC select
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    // Info section
    expect(screen.getByTestId('icon-lightning')).toBeInTheDocument();
  });

  it('shows email input with placeholder', () => {
    const mockClose = vi.fn();
    render(<AddUserModal open={true} onClose={mockClose} />);

    const input = screen.getByPlaceholderText(/user@example\.com/);
    expect(input).toBeInTheDocument();
  });

  it('renders modal footer with buttons', () => {
    const mockClose = vi.fn();
    render(<AddUserModal open={true} onClose={mockClose} />);

    const footer = screen.getByTestId('modal-footer');
    expect(footer).toBeInTheDocument();

    const buttons = footer.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2); // cancel + create
  });

  it('shows error panel when isError is true', () => {
    mockUseCreateUser.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: true,
      error: new Error('Email already exists'),
    });

    const mockClose = vi.fn();
    render(<AddUserModal open={true} onClose={mockClose} />);
    expect(screen.getByText(/Email already exists/)).toBeInTheDocument();
  });

  it('shows created-addresses view after successful creation', async () => {
    let capturedOnSuccess: ((result: unknown) => void) | undefined;
    const mutateSpy = vi.fn((_body: unknown, opts: { onSuccess?: (r: unknown) => void }) => {
      capturedOnSuccess = opts.onSuccess;
    });

    mockUseCreateUser.mockReturnValue({
      mutate: mutateSpy,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    const mockClose = vi.fn();
    render(<AddUserModal open={true} onClose={mockClose} />);

    const input = screen.getByRole('textbox', { name: /email/i });
    await user.type(input, 'alice@test.com');

    const createBtn = screen.getByRole('button', { name: /create/i });
    await user.click(createBtn);

    // Simulate onSuccess callback from the mutation
    act(() => {
      capturedOnSuccess?.({
        user: { id: 'u-1', email: 'alice@test.com', kycTier: 'basic' },
        addresses: [
          { chain: 'bnb', address: '0xBnbAddr', derivationPath: null, derivationIndex: 0 },
          { chain: 'sol', address: 'SolAddr123', derivationPath: null, derivationIndex: 0 },
        ],
      });
    });

    // After success, the "Done" button appears
    expect(await screen.findByRole('button', { name: /done/i })).toBeInTheDocument();
  });
});
