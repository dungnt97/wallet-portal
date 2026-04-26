// Tests for features/ops/kill-switch-card.tsx — big red toggle with confirm modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KillSwitchCard } from '../kill-switch-card';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/components/overlays/toast-host', () => ({
  useToast: () => vi.fn(),
}));

const mockToggleMutate = vi.fn();
const mockUseKillSwitch = vi.fn();
const mockUseToggleKillSwitch = vi.fn();

vi.mock('@/api/queries', () => ({
  useKillSwitch: () => mockUseKillSwitch(),
  useToggleKillSwitch: () => mockUseToggleKillSwitch(),
}));

vi.mock('@/components/custody', () => ({
  Toggle: ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      data-testid="toggle"
    >
      {on ? 'ON' : 'OFF'}
    </button>
  ),
}));

// ConfirmToggleModal needs basic mock so it renders without full component tree
vi.mock('../confirm-toggle-modal', () => ({
  ConfirmToggleModal: ({
    open,
    targetEnabled,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    targetEnabled: boolean;
    onConfirm: (reason: string) => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-modal">
        <span data-testid="modal-target">{targetEnabled ? 'enable' : 'disable'}</span>
        <button type="button" data-testid="modal-confirm" onClick={() => onConfirm('test reason')}>
          Confirm
        </button>
        <button type="button" data-testid="modal-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('KillSwitchCard', () => {
  it('renders card title', () => {
    mockUseKillSwitch.mockReturnValue({ data: { enabled: false }, isLoading: false });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    expect(screen.getByText('ops.killSwitch.cardTitle')).toBeInTheDocument();
  });

  it('shows status OFF label when disabled', () => {
    mockUseKillSwitch.mockReturnValue({ data: { enabled: false }, isLoading: false });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    expect(screen.getByText('ops.killSwitch.statusOff')).toBeInTheDocument();
  });

  it('shows status ON label when enabled', () => {
    mockUseKillSwitch.mockReturnValue({
      data: { enabled: true, reason: 'DDoS' },
      isLoading: false,
    });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    expect(screen.getByText('ops.killSwitch.statusOn')).toBeInTheDocument();
  });

  it('shows red banner when kill-switch is enabled', () => {
    mockUseKillSwitch.mockReturnValue({
      data: { enabled: true, reason: 'DDoS attack' },
      isLoading: false,
    });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    expect(screen.getByText('ops.killSwitch.banner')).toBeInTheDocument();
  });

  it('does not show red banner when disabled', () => {
    mockUseKillSwitch.mockReturnValue({ data: { enabled: false }, isLoading: false });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    expect(screen.queryByText('ops.killSwitch.banner')).not.toBeInTheDocument();
  });

  it('shows spinner when loading', () => {
    mockUseKillSwitch.mockReturnValue({ data: undefined, isLoading: true });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });

  it('shows toggle when not loading', () => {
    mockUseKillSwitch.mockReturnValue({ data: { enabled: false }, isLoading: false });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    expect(screen.getByTestId('toggle')).toBeInTheDocument();
  });

  it('opens confirm modal when toggle is clicked', async () => {
    const user = userEvent.setup();
    mockUseKillSwitch.mockReturnValue({ data: { enabled: false }, isLoading: false });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    await user.click(screen.getByTestId('toggle'));
    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
  });

  it('passes targetEnabled=true when toggling from disabled', async () => {
    const user = userEvent.setup();
    mockUseKillSwitch.mockReturnValue({ data: { enabled: false }, isLoading: false });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    await user.click(screen.getByTestId('toggle'));
    expect(screen.getByTestId('modal-target').textContent).toBe('enable');
  });

  it('passes targetEnabled=false when toggling from enabled', async () => {
    const user = userEvent.setup();
    mockUseKillSwitch.mockReturnValue({
      data: { enabled: true, reason: 'DDoS' },
      isLoading: false,
    });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    await user.click(screen.getByTestId('toggle'));
    expect(screen.getByTestId('modal-target').textContent).toBe('disable');
  });

  it('closes modal and calls mutate when confirmed', async () => {
    const user = userEvent.setup();
    mockUseKillSwitch.mockReturnValue({ data: { enabled: false }, isLoading: false });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    await user.click(screen.getByTestId('toggle'));
    await user.click(screen.getByTestId('modal-confirm'));
    expect(mockToggleMutate).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, reason: 'test reason' }),
      expect.any(Object)
    );
    expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
  });

  it('closes modal without mutate when cancelled', async () => {
    const user = userEvent.setup();
    mockToggleMutate.mockClear();
    mockUseKillSwitch.mockReturnValue({ data: { enabled: false }, isLoading: false });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    await user.click(screen.getByTestId('toggle'));
    await user.click(screen.getByTestId('modal-cancel'));
    expect(mockToggleMutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
  });

  it('shows lastUpdated timestamp when updatedAt is present', () => {
    mockUseKillSwitch.mockReturnValue({
      data: { enabled: false, updatedAt: '2024-01-15T10:00:00Z' },
      isLoading: false,
    });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    expect(screen.getByText(/ops.killSwitch.lastUpdated/)).toBeInTheDocument();
  });

  it('does not show lastUpdated when updatedAt is absent', () => {
    mockUseKillSwitch.mockReturnValue({ data: { enabled: false }, isLoading: false });
    mockUseToggleKillSwitch.mockReturnValue({ mutate: mockToggleMutate, isPending: false });
    render(<KillSwitchCard />);
    expect(screen.queryByText(/ops.killSwitch.lastUpdated/)).not.toBeInTheDocument();
  });
});
