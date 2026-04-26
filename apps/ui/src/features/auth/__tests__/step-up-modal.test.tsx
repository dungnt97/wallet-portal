// Tests for features/auth/step-up-modal.tsx — StepUpModal WebAuthn verification dialog.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StepUpModal } from '../step-up-modal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockRunStepUp = vi.fn();

vi.mock('../use-step-up', () => ({
  useStepUp: () => ({ runStepUp: mockRunStepUp }),
}));

// lucide-react icons — stub to avoid SVG issues in jsdom
vi.mock('lucide-react', () => ({
  Loader2: ({ className }: { className?: string }) => (
    <span data-testid="icon-loader" className={className} />
  ),
  ShieldCheck: () => <span data-testid="icon-shield" />,
  X: () => <span data-testid="icon-x" />,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StepUpModal', () => {
  it('renders the verify button in idle state', () => {
    render(<StepUpModal onSuccess={vi.fn()} onCancel={vi.fn()} />);
    // t('auth.verifyWithKey') → 'auth.verifyWithKey' (identity mock)
    expect(screen.getByText('auth.verifyWithKey')).toBeInTheDocument();
  });

  it('renders the shield icon', () => {
    render(<StepUpModal onSuccess={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('icon-shield')).toBeInTheDocument();
  });

  it('renders a cancel button', () => {
    render(<StepUpModal onSuccess={vi.fn()} onCancel={vi.fn()} />);
    // There are two buttons with t('common.cancel') text and aria-label
    const cancelBtns = screen.getAllByText('common.cancel');
    expect(cancelBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onCancel when the close (X) button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<StepUpModal onSuccess={vi.fn()} onCancel={onCancel} />);
    // The X icon is inside a button with aria-label=t('common.cancel')
    const closeBtn = screen.getByLabelText('common.cancel');
    await user.click(closeBtn);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onSuccess after successful step-up', async () => {
    mockRunStepUp.mockResolvedValueOnce({ ok: true, steppedUpAt: new Date().toISOString() });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<StepUpModal onSuccess={onSuccess} onCancel={vi.fn()} />);
    await user.click(screen.getByText('auth.verifyWithKey'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it('shows error message when runStepUp throws a generic error', async () => {
    mockRunStepUp.mockRejectedValueOnce(new Error('Device not supported'));
    const user = userEvent.setup();
    render(<StepUpModal onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await user.click(screen.getByText('auth.verifyWithKey'));
    await waitFor(() => expect(screen.getByText('Device not supported')).toBeInTheDocument());
  });

  it('shows auth.verificationCancelled when NotAllowedError is thrown', async () => {
    const err = new Error('User cancelled');
    err.name = 'NotAllowedError';
    mockRunStepUp.mockRejectedValueOnce(err);
    const user = userEvent.setup();
    render(<StepUpModal onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await user.click(screen.getByText('auth.verifyWithKey'));
    await waitFor(() => expect(screen.getByText('auth.verificationCancelled')).toBeInTheDocument());
  });

  it('shows auth.verificationFailed when non-Error is thrown', async () => {
    mockRunStepUp.mockRejectedValueOnce('string error');
    const user = userEvent.setup();
    render(<StepUpModal onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await user.click(screen.getByText('auth.verifyWithKey'));
    await waitFor(() => expect(screen.getByText('auth.verificationFailed')).toBeInTheDocument());
  });

  it('disables verify button while pending', async () => {
    let resolveFn!: () => void;
    mockRunStepUp.mockReturnValueOnce(
      new Promise<{ ok: boolean; steppedUpAt: string }>((res) => {
        resolveFn = () => res({ ok: true, steppedUpAt: '' });
      })
    );
    const user = userEvent.setup();
    render(<StepUpModal onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const verifyBtn = screen.getByText('auth.verifyWithKey').closest('button') as HTMLElement;
    await user.click(verifyBtn);
    expect(verifyBtn).toBeDisabled();
    resolveFn();
  });

  it('shows waiting text and loader icon while pending', async () => {
    let resolveFn!: () => void;
    mockRunStepUp.mockReturnValueOnce(
      new Promise<{ ok: boolean; steppedUpAt: string }>((res) => {
        resolveFn = () => res({ ok: true, steppedUpAt: '' });
      })
    );
    const user = userEvent.setup();
    render(<StepUpModal onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await user.click(screen.getByText('auth.verifyWithKey').closest('button') as HTMLElement);
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
    expect(screen.getByText('auth.waitingForKey')).toBeInTheDocument();
    resolveFn();
  });
});
