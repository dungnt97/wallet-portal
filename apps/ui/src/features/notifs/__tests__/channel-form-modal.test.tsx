// Tests for features/notifs/channel-form-modal.tsx — add/edit notification channel modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChannelFormModal } from '../channel-form-modal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockToast = vi.fn();
vi.mock('@/components/overlays/toast-host', () => ({
  useToast: () => mockToast,
}));

const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();

vi.mock('@/api/queries', () => ({
  useCreateAdminChannel: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdateAdminChannel: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch1',
    kind: 'email' as const,
    name: 'Treasury Alerts',
    target: 'alerts@example.com',
    severityFilter: 'info' as const,
    enabled: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChannelFormModal', () => {
  it('renders nothing when closed', () => {
    render(<ChannelFormModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders modal when open', () => {
    render(<ChannelFormModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('shows add title when no initialData', () => {
    render(<ChannelFormModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'notifs.addChannel' })).toBeInTheDocument();
  });

  it('shows edit title when initialData provided', () => {
    render(<ChannelFormModal open={true} onClose={vi.fn()} initialData={makeChannel()} />);
    expect(screen.getByText('notifs.editChannel')).toBeInTheDocument();
  });

  it('shows kind selector buttons for new channel', () => {
    render(<ChannelFormModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('PagerDuty')).toBeInTheDocument();
    expect(screen.getByText('Webhook')).toBeInTheDocument();
  });

  it('hides kind selector in edit mode', () => {
    render(<ChannelFormModal open={true} onClose={vi.fn()} initialData={makeChannel()} />);
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
  });

  it('pre-fills name field in edit mode', () => {
    render(<ChannelFormModal open={true} onClose={vi.fn()} initialData={makeChannel()} />);
    const nameInput = screen.getByDisplayValue('Treasury Alerts') as HTMLInputElement;
    expect(nameInput).toBeInTheDocument();
  });

  it('pre-fills target field in edit mode', () => {
    render(<ChannelFormModal open={true} onClose={vi.fn()} initialData={makeChannel()} />);
    const targetInput = screen.getByDisplayValue('alerts@example.com') as HTMLInputElement;
    expect(targetInput).toBeInTheDocument();
  });

  it('submit button is disabled when name is empty', () => {
    render(<ChannelFormModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('notifs.addChannel', { selector: 'button' })).toBeDisabled();
  });

  it('submit button is disabled when target is empty', async () => {
    const user = userEvent.setup();
    render(<ChannelFormModal open={true} onClose={vi.fn()} />);
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], 'My Channel');
    // target still empty
    expect(screen.getByText('notifs.addChannel', { selector: 'button' })).toBeDisabled();
  });

  it('shows email validation error for invalid email', async () => {
    const user = userEvent.setup();
    render(<ChannelFormModal open={true} onClose={vi.fn()} />);
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], 'My Channel');
    await user.type(inputs[1], 'not-an-email');
    await user.click(screen.getByText('notifs.addChannel', { selector: 'button' }) as HTMLElement);
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('shows URL validation error for invalid slack URL', async () => {
    const user = userEvent.setup();
    render(<ChannelFormModal open={true} onClose={vi.fn()} />);
    // Switch to Slack kind
    await user.click(screen.getByText('Slack'));
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], 'Slack Channel');
    await user.type(inputs[1], 'not-a-url');
    await user.click(screen.getByText('notifs.addChannel', { selector: 'button' }) as HTMLElement);
    expect(screen.getByText('Enter a valid https:// URL')).toBeInTheDocument();
  });

  it('calls createMutateAsync with correct payload on create', async () => {
    mockCreateMutateAsync.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ChannelFormModal open={true} onClose={vi.fn()} />);
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], 'Ops Team');
    await user.type(inputs[1], 'ops@example.com');
    await user.click(screen.getByText('notifs.addChannel', { selector: 'button' }) as HTMLElement);
    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'email',
        name: 'Ops Team',
        target: 'ops@example.com',
        severityFilter: 'info',
      })
    );
  });

  it('calls updateMutateAsync on edit mode submit', async () => {
    mockUpdateMutateAsync.mockResolvedValue({});
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ChannelFormModal open={true} onClose={onClose} initialData={makeChannel()} />);
    await user.click(screen.getByText('common.save', { selector: 'button' }) as HTMLElement);
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ch1', name: 'Treasury Alerts' })
    );
  });

  it('calls onClose after successful create', async () => {
    mockCreateMutateAsync.mockResolvedValue({});
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ChannelFormModal open={true} onClose={onClose} />);
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], 'Test Channel');
    await user.type(inputs[1], 'test@example.com');
    await user.click(screen.getByText('notifs.addChannel', { selector: 'button' }) as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders severity filter radio options', () => {
    render(<ChannelFormModal open={true} onClose={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
  });

  it('defaults severity filter to info', () => {
    render(<ChannelFormModal open={true} onClose={vi.fn()} />);
    const infoRadio = screen.getAllByRole('radio')[0] as HTMLInputElement;
    expect(infoRadio.checked).toBe(true);
  });

  it('calls onClose when cancel is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ChannelFormModal open={true} onClose={onClose} />);
    await user.click(screen.getByText('common.cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('changes target placeholder when kind is switched to Slack', async () => {
    const user = userEvent.setup();
    render(<ChannelFormModal open={true} onClose={vi.fn()} />);
    await user.click(screen.getByText('Slack'));
    expect(screen.getByPlaceholderText('https://hooks.slack.com/services/...')).toBeInTheDocument();
  });
});
