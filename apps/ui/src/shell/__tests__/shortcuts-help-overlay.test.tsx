// Tests for shell/shortcuts-help-overlay.tsx — keyboard shortcut reference panel.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ShortcutsHelpOverlay } from '../shortcuts-help-overlay';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/icons', () => ({
  I: {
    Command: () => <span data-testid="icon-command" />,
    Close: () => <span data-testid="icon-close" />,
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ShortcutsHelpOverlay', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<ShortcutsHelpOverlay open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog when open=true', () => {
    render(<ShortcutsHelpOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('dialog has aria-modal', () => {
    render(<ShortcutsHelpOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('renders the title from i18n key', () => {
    render(<ShortcutsHelpOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getAllByText('shortcuts.helpTitle').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Global" section label', () => {
    render(<ShortcutsHelpOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Global')).toBeInTheDocument();
  });

  it('renders nav shortcut descriptions', () => {
    render(<ShortcutsHelpOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByText('shortcuts.dashboard')).toBeInTheDocument();
    expect(screen.getByText('shortcuts.withdrawals')).toBeInTheDocument();
  });

  it('renders global shortcut descriptions', () => {
    render(<ShortcutsHelpOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByText('shortcuts.cmdPalette')).toBeInTheDocument();
    expect(screen.getByText('shortcuts.helpToggle')).toBeInTheDocument();
  });

  it('renders kbd elements for shortcut keys', () => {
    render(<ShortcutsHelpOverlay open={true} onClose={vi.fn()} />);
    const kbds = document.querySelectorAll('kbd');
    expect(kbds.length).toBeGreaterThan(0);
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ShortcutsHelpOverlay open={true} onClose={onClose} />);
    await user.click(screen.getByLabelText('Close shortcuts help'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ShortcutsHelpOverlay open={true} onClose={onClose} />);
    const backdrop = screen.getByRole('presentation');
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape keydown', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ShortcutsHelpOverlay open={true} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on ? keydown', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ShortcutsHelpOverlay open={true} onClose={onClose} />);
    await user.keyboard('?');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not attach keyboard listener when closed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ShortcutsHelpOverlay open={false} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders Command icon in header', () => {
    render(<ShortcutsHelpOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('icon-command')).toBeInTheDocument();
  });
});
