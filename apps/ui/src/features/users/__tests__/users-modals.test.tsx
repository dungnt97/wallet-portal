/* biome-ignore lint/suspicious/noExplicitAny: mocking utilities require any types */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddUserModal } from '../users-modals';

vi.mock('@/api/users', () => ({
  useCreateUser: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('@/components/overlays', () => ({
  Modal: ({ open, onClose, title, children, footer }: any) =>
    open ? (
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
});
