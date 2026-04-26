// Tests for features/signing/policy-block-modal.tsx — policy evaluation failure modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PolicyBlockModal } from '../policy-block-modal';

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
        ({ size, className }: { size?: number; className?: string }) => (
          <span data-testid={`icon-${String(key)}`} className={className} data-size={size} />
        ),
    }
  ),
}));

vi.mock('../policy-preview', () => ({
  evaluatePolicy: vi.fn((_op) => ({
    passed: false,
    checks: [
      { key: 'velocity', label: 'Velocity limit', detail: 'Exceeds daily limit', ok: false },
      {
        key: 'whitelist',
        label: 'Destination whitelist',
        detail: 'Unknown destination',
        ok: false,
      },
      { key: 'signer', label: 'Authorized signer', detail: 'Wallet matches', ok: true },
    ],
  })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOp(overrides: Record<string, unknown> = {}) {
  return {
    id: 'op-123',
    chain: 'bnb' as const,
    token: 'USDT' as const,
    amount: 1000,
    destination: '0xabcdef',
    signaturesRequired: 2,
    totalSigners: 3,
    destinationKnown: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PolicyBlockModal', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<PolicyBlockModal open={false} op={makeOp()} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when op is null', () => {
    const { container } = render(<PolicyBlockModal open={true} op={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog when open and op provided', () => {
    render(<PolicyBlockModal open={true} op={makeOp()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows policy block title', () => {
    render(<PolicyBlockModal open={true} op={makeOp()} onClose={vi.fn()} />);
    expect(screen.getByText('signing.policyBlockTitle')).toBeInTheDocument();
  });

  it('shows policy block subtitle', () => {
    render(<PolicyBlockModal open={true} op={makeOp()} onClose={vi.fn()} />);
    expect(screen.getByText('signing.policyBlockSubtitle')).toBeInTheDocument();
  });

  it('shows policy block text', () => {
    render(<PolicyBlockModal open={true} op={makeOp()} onClose={vi.fn()} />);
    expect(screen.getByText('signing.policyBlockText')).toBeInTheDocument();
  });

  it('lists only failed policy checks (not ok ones)', () => {
    render(<PolicyBlockModal open={true} op={makeOp()} onClose={vi.fn()} />);
    expect(screen.getByText('Velocity limit')).toBeInTheDocument();
    expect(screen.getByText('Destination whitelist')).toBeInTheDocument();
    // ok=true check should not appear
    expect(screen.queryByText('Authorized signer')).not.toBeInTheDocument();
  });

  it('shows failure detail text', () => {
    render(<PolicyBlockModal open={true} op={makeOp()} onClose={vi.fn()} />);
    expect(screen.getByText('Exceeds daily limit')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PolicyBlockModal open={true} op={makeOp()} onClose={onClose} />);
    await user.click(screen.getByLabelText('common.close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the ok/close action button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PolicyBlockModal open={true} op={makeOp()} onClose={onClose} />);
    await user.click(screen.getByText('signing.policyBlockClose').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop (scrim) is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PolicyBlockModal open={true} op={makeOp()} onClose={onClose} />);
    await user.click(document.querySelector('.modal-scrim') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('has aria-modal attribute', () => {
    render(<PolicyBlockModal open={true} op={makeOp()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
