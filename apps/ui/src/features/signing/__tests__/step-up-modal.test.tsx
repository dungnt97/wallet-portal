// Tests for features/signing/step-up-modal.tsx — WebAuthn step-up modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StepUpModal } from '../step-up-modal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/icons', () => ({
  I: new Proxy(
    {},
    {
      get:
        (_t, key) =>
        ({ size }: { size?: number }) => (
          <span data-testid={`icon-${String(key)}`} data-size={size} />
        ),
    }
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOp(overrides: Record<string, unknown> = {}) {
  return {
    id: 'op-789',
    chain: 'bnb' as const,
    token: 'USDT' as const,
    amount: 2000,
    destination: '0xdest',
    signaturesRequired: 2,
    totalSigners: 3,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StepUpModal', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <StepUpModal
        open={false}
        op={makeOp()}
        onClose={vi.fn()}
        onVerified={vi.fn()}
        onUseOtpFallback={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when op is null', () => {
    const { container } = render(
      <StepUpModal
        open={true}
        op={null}
        onClose={vi.fn()}
        onVerified={vi.fn()}
        onUseOtpFallback={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog when open and op provided', () => {
    render(
      <StepUpModal
        open={true}
        op={makeOp()}
        onClose={vi.fn()}
        onVerified={vi.fn()}
        onUseOtpFallback={vi.fn()}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows step-up title', () => {
    render(
      <StepUpModal
        open={true}
        op={makeOp()}
        onClose={vi.fn()}
        onVerified={vi.fn()}
        onUseOtpFallback={vi.fn()}
      />
    );
    expect(screen.getAllByText('signing.stepUpTitle').length).toBeGreaterThan(0);
  });

  it('shows step-up subtitle', () => {
    render(
      <StepUpModal
        open={true}
        op={makeOp()}
        onClose={vi.fn()}
        onVerified={vi.fn()}
        onUseOtpFallback={vi.fn()}
      />
    );
    expect(screen.getByText('signing.stepUpSubtitle')).toBeInTheDocument();
  });

  it('renders close button with aria-label', () => {
    render(
      <StepUpModal
        open={true}
        op={makeOp()}
        onClose={vi.fn()}
        onVerified={vi.fn()}
        onUseOtpFallback={vi.fn()}
      />
    );
    expect(screen.getByLabelText('common.close')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <StepUpModal
        open={true}
        op={makeOp()}
        onClose={onClose}
        onVerified={vi.fn()}
        onUseOtpFallback={vi.fn()}
      />
    );
    await user.click(screen.getByLabelText('common.close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop (scrim) is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <StepUpModal
        open={true}
        op={makeOp()}
        onClose={onClose}
        onVerified={vi.fn()}
        onUseOtpFallback={vi.fn()}
      />
    );
    await user.click(document.querySelector('.modal-scrim') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders OTP fallback button', () => {
    render(
      <StepUpModal
        open={true}
        op={makeOp()}
        onClose={vi.fn()}
        onVerified={vi.fn()}
        onUseOtpFallback={vi.fn()}
      />
    );
    expect(screen.getByText('signing.stepUpFallback')).toBeInTheDocument();
  });

  it('calls onUseOtpFallback when fallback button clicked', async () => {
    const onUseOtpFallback = vi.fn();
    const user = userEvent.setup();
    render(
      <StepUpModal
        open={true}
        op={makeOp()}
        onClose={vi.fn()}
        onVerified={vi.fn()}
        onUseOtpFallback={onUseOtpFallback}
      />
    );
    await user.click(screen.getByText('signing.stepUpFallback').closest('button') as HTMLElement);
    expect(onUseOtpFallback).toHaveBeenCalled();
  });

  it('has aria-modal attribute', () => {
    render(
      <StepUpModal
        open={true}
        op={makeOp()}
        onClose={vi.fn()}
        onVerified={vi.fn()}
        onUseOtpFallback={vi.fn()}
      />
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('shows verify button initially enabled', () => {
    render(
      <StepUpModal
        open={true}
        op={makeOp()}
        onClose={vi.fn()}
        onVerified={vi.fn()}
        onUseOtpFallback={vi.fn()}
      />
    );
    // In idle state the verify/step-up button (not fallback) should be enabled
    const mainBtn = screen
      .getAllByRole('button')
      .find(
        (b) =>
          b.textContent?.includes('signing.stepUpTitle') && !b.textContent?.includes('fallback')
      );
    expect(mainBtn).toBeDefined();
    expect(mainBtn).not.toBeDisabled();
  });

  it('shows WebAuthn phishing-resistant note', () => {
    render(
      <StepUpModal
        open={true}
        op={makeOp()}
        onClose={vi.fn()}
        onVerified={vi.fn()}
        onUseOtpFallback={vi.fn()}
      />
    );
    expect(screen.getByText(/phishing-resistant/)).toBeInTheDocument();
  });
});
