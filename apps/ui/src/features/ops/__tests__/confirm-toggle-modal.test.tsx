// Tests for features/ops/confirm-toggle-modal.tsx — kill-switch confirm dialog.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmToggleModal } from '../confirm-toggle-modal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConfirmToggleModal', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <ConfirmToggleModal
        open={false}
        targetEnabled={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when open=true', () => {
    render(
      <ConfirmToggleModal open={true} targetEnabled={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(document.querySelector('.modal')).toBeInTheDocument();
  });

  it('shows enable title when targetEnabled=true', () => {
    render(
      <ConfirmToggleModal open={true} targetEnabled={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('ops.killSwitch.confirmEnableTitle')).toBeInTheDocument();
  });

  it('shows disable title when targetEnabled=false', () => {
    render(
      <ConfirmToggleModal
        open={true}
        targetEnabled={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('ops.killSwitch.confirmDisableTitle')).toBeInTheDocument();
  });

  it('disables confirm button when enabling and reason is empty', () => {
    render(
      <ConfirmToggleModal open={true} targetEnabled={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('ops.killSwitch.confirmEnableBtn').closest('button')).toBeDisabled();
  });

  it('does not disable confirm button when disabling even with empty reason', () => {
    render(
      <ConfirmToggleModal
        open={true}
        targetEnabled={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(
      screen.getByText('ops.killSwitch.confirmDisableBtn').closest('button')
    ).not.toBeDisabled();
  });

  it('enables confirm button when enabling and reason is provided', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmToggleModal open={true} targetEnabled={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    await user.type(screen.getByRole('textbox'), 'DDoS attack in progress');
    expect(
      screen.getByText('ops.killSwitch.confirmEnableBtn').closest('button')
    ).not.toBeDisabled();
  });

  it('calls onConfirm with trimmed reason when confirm clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmToggleModal
        open={true}
        targetEnabled={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    await user.type(screen.getByRole('textbox'), '  incident response  ');
    await user.click(
      screen.getByText('ops.killSwitch.confirmEnableBtn').closest('button') as HTMLElement
    );
    expect(onConfirm).toHaveBeenCalledWith('incident response');
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmToggleModal
        open={true}
        targetEnabled={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    await user.click(screen.getByText('ops.killSwitch.cancelBtn').closest('button') as HTMLElement);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel when backdrop is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmToggleModal
        open={true}
        targetEnabled={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    await user.click(document.querySelector('.modal-backdrop') as HTMLElement);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onConfirm on Enter key when reason is provided', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmToggleModal
        open={true}
        targetEnabled={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    await user.type(screen.getByRole('textbox'), 'attack detected{Enter}');
    expect(onConfirm).toHaveBeenCalledWith('attack detected');
  });

  it('calls onCancel on Escape key', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmToggleModal
        open={true}
        targetEnabled={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    await user.type(screen.getByRole('textbox'), '{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows asterisk required marker when enabling', () => {
    render(
      <ConfirmToggleModal open={true} targetEnabled={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('does not show asterisk when disabling', () => {
    render(
      <ConfirmToggleModal
        open={true}
        targetEnabled={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });
});
