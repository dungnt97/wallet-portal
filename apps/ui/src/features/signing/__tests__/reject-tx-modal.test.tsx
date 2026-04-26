// Tests for features/signing/reject-tx-modal.tsx — rejection reason capture modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RejectTxModal } from '../reject-tx-modal';

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
    id: 'op-456',
    chain: 'bnb' as const,
    token: 'USDT' as const,
    amount: 500,
    destination: '0xdestination',
    signaturesRequired: 2,
    totalSigners: 3,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RejectTxModal', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <RejectTxModal open={false} op={makeOp()} onClose={vi.fn()} onRejected={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when op is null', () => {
    const { container } = render(
      <RejectTxModal open={true} op={null} onClose={vi.fn()} onRejected={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog when open and op provided', () => {
    render(<RejectTxModal open={true} op={makeOp()} onClose={vi.fn()} onRejected={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows title with op id', () => {
    render(<RejectTxModal open={true} op={makeOp()} onClose={vi.fn()} onRejected={vi.fn()} />);
    expect(screen.getByText('signing.rejectOpTitle')).toBeInTheDocument();
  });

  it('shows all six rejection reason radio options', () => {
    render(<RejectTxModal open={true} op={makeOp()} onClose={vi.fn()} onRejected={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(6);
  });

  it('defaults to wrong-destination reason selected', () => {
    render(<RejectTxModal open={true} op={makeOp()} onClose={vi.fn()} onRejected={vi.fn()} />);
    const firstRadio = screen.getAllByRole('radio')[0] as HTMLInputElement;
    expect(firstRadio.value).toBe('wrong-destination');
    expect(firstRadio.checked).toBe(true);
  });

  it('renders comment textarea', () => {
    render(<RejectTxModal open={true} op={makeOp()} onClose={vi.fn()} onRejected={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders reject and cancel buttons', () => {
    render(<RejectTxModal open={true} op={makeOp()} onClose={vi.fn()} onRejected={vi.fn()} />);
    expect(screen.getByText('signing.reject')).toBeInTheDocument();
    expect(screen.getByText('signing.cancel')).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RejectTxModal open={true} op={makeOp()} onClose={onClose} onRejected={vi.fn()} />);
    await user.click(screen.getByText('signing.cancel').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop (scrim) is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RejectTxModal open={true} op={makeOp()} onClose={onClose} onRejected={vi.fn()} />);
    await user.click(document.querySelector('.modal-scrim') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onRejected with selected reason on reject', async () => {
    const onRejected = vi.fn();
    const user = userEvent.setup();
    render(<RejectTxModal open={true} op={makeOp()} onClose={vi.fn()} onRejected={onRejected} />);
    await user.click(screen.getByText('signing.reject').closest('button') as HTMLElement);
    expect(onRejected).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'wrong-destination', comment: '' })
    );
  });

  it('calls onClose after rejecting', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RejectTxModal open={true} op={makeOp()} onClose={onClose} onRejected={vi.fn()} />);
    await user.click(screen.getByText('signing.reject').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('includes typed comment in onRejected call', async () => {
    const onRejected = vi.fn();
    const user = userEvent.setup();
    render(<RejectTxModal open={true} op={makeOp()} onClose={vi.fn()} onRejected={onRejected} />);
    await user.type(screen.getByRole('textbox'), 'Suspicious counterparty');
    await user.click(screen.getByText('signing.reject').closest('button') as HTMLElement);
    expect(onRejected).toHaveBeenCalledWith(
      expect.objectContaining({ comment: 'Suspicious counterparty' })
    );
  });

  it('can select a different rejection reason', async () => {
    const onRejected = vi.fn();
    const user = userEvent.setup();
    render(<RejectTxModal open={true} op={makeOp()} onClose={vi.fn()} onRejected={onRejected} />);
    const radios = screen.getAllByRole('radio');
    // Select "wrong-amount" (index 1)
    await user.click(radios[1]);
    await user.click(screen.getByText('signing.reject').closest('button') as HTMLElement);
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ reason: 'wrong-amount' }));
  });

  it('has aria-modal attribute', () => {
    render(<RejectTxModal open={true} op={makeOp()} onClose={vi.fn()} onRejected={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
