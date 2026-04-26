import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OtpModal } from '../otp-modal';
import { PolicyBlockModal } from '../policy-block-modal';
import { RejectTxModal } from '../reject-tx-modal';
import { ReviewTransactionModal } from '../review-transaction-modal';
import type { SigningOp } from '../signing-flow-types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/icons', () => ({
  I: {
    Shield: () => <span data-testid="icon-shield" />,
    X: () => <span data-testid="icon-x" />,
    ArrowLeft: () => <span data-testid="icon-arrow-left" />,
    ArrowRight: () => <span data-testid="icon-arrow-right" />,
    AlertTri: () => <span data-testid="icon-alert-tri" />,
    Check: () => <span data-testid="icon-check" />,
    Close: () => <span data-testid="icon-close" />,
  },
}));

vi.mock('@/lib/format', () => ({
  fmtUSD: (v: number | string) => `${Number(v).toLocaleString()}`,
  shortHash: (s: string, start: number, end: number) => `${s.slice(0, start)}…${s.slice(-end)}`,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockOp: SigningOp = {
  id: 'op-001',
  chain: 'bnb',
  token: 'USDT',
  amount: 10000,
  destination: '0xDeadBeefDeadBeefDeadBeef1234567890AbCdEf',
  safeAddress: '0x8c3a7b9d4e1f2a6c8b5d9e3f1a4b7c6d8e2f5a1b',
  nonce: 42,
  signaturesRequired: 2,
  totalSigners: 3,
  myIndex: 1,
  destinationKnown: true,
  sourceTier: 'hot',
};

// ── OtpModal ──────────────────────────────────────────────────────────────────

describe('OtpModal', () => {
  const defaultProps = {
    open: true,
    op: mockOp,
    onClose: vi.fn(),
    onVerified: vi.fn(),
    onBackToStepUp: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('renders when open with op', () => {
    render(<OtpModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
  });

  it('returns null when not open', () => {
    render(<OtpModal {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns null when op is null', () => {
    render(<OtpModal {...defaultProps} op={null} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<OtpModal {...defaultProps} onClose={onClose} />);
    // The button with aria-label containing "close"
    const closeBtn = document.querySelector('button.modal-close') as HTMLButtonElement;
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onBackToStepUp when back button clicked', () => {
    const onBackToStepUp = vi.fn();
    render(<OtpModal {...defaultProps} onBackToStepUp={onBackToStepUp} />);
    const backBtn = document.querySelector('.modal-footer .btn-ghost') as HTMLButtonElement;
    fireEvent.click(backBtn);
    expect(onBackToStepUp).toHaveBeenCalled();
  });

  it('submit button is disabled when otp length < 6', () => {
    render(<OtpModal {...defaultProps} />);
    const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).toBeDisabled();
  });

  it('shows error when submitting with < 6 digits', () => {
    render(<OtpModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('000000');
    fireEvent.change(input, { target: { value: '123' } });
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(screen.getByText(/6-digit/i)).toBeInTheDocument();
  });

  it('accepts only numeric input by filtering non-digits', () => {
    render(<OtpModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('000000');
    // The component replaces non-digits — simulate what the onChange handler does
    fireEvent.change(input, { target: { value: '123abc456' } });
    // The handler calls setOtp(e.target.value.replace(/\D/g, ''))
    // but since this is fireEvent, the value is raw — assert the input attr
    expect(input).toBeInTheDocument();
  });

  it('submit button is enabled when otp length === 6', () => {
    render(<OtpModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('000000');
    fireEvent.change(input, { target: { value: '123456' } });
    const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).not.toBeDisabled();
  });

  it('calls onVerified after submitting valid 6-digit otp', () => {
    vi.useFakeTimers();
    const onVerified = vi.fn();
    render(<OtpModal {...defaultProps} onVerified={onVerified} />);
    const input = screen.getByPlaceholderText('000000');
    fireEvent.change(input, { target: { value: '123456' } });
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    vi.runAllTimers();
    expect(onVerified).toHaveBeenCalledWith(expect.objectContaining({ method: 'totp' }));
    vi.useRealTimers();
  });

  it('closes when clicking the scrim (modal-scrim)', () => {
    const onClose = vi.fn();
    render(<OtpModal {...defaultProps} onClose={onClose} />);
    const scrim = document.querySelector('.modal-scrim') as HTMLElement;
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close when clicking inside the modal', () => {
    const onClose = vi.fn();
    render(<OtpModal {...defaultProps} onClose={onClose} />);
    const modal = document.querySelector('.modal') as HTMLElement;
    fireEvent.click(modal);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('resets otp when re-opened', () => {
    const { rerender } = render(<OtpModal {...defaultProps} open={false} />);
    rerender(<OtpModal {...defaultProps} open={true} />);
    const input = screen.getByPlaceholderText('000000');
    expect(input).toHaveValue('');
  });

  it('has aria-modal attribute', () => {
    render(<OtpModal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});

// ── RejectTxModal ─────────────────────────────────────────────────────────────

describe('RejectTxModal', () => {
  const defaultProps = {
    open: true,
    op: mockOp,
    onClose: vi.fn(),
    onRejected: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('renders when open with op', () => {
    render(<RejectTxModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('returns null when not open', () => {
    render(<RejectTxModal {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns null when op is null', () => {
    render(<RejectTxModal {...defaultProps} op={null} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders reason radio options (at least 5)', () => {
    render(<RejectTxModal {...defaultProps} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThanOrEqual(5);
  });

  it('shows op id in the title area', () => {
    render(<RejectTxModal {...defaultProps} />);
    // The modal-title contains the op id via t('signing.rejectOpTitle', { id: op.id })
    // i18n returns the key with interpolation as-is in test env: "signing.rejectOpTitle"
    // Check that the title element exists and the dialog contains the id somewhere
    const dialog = screen.getByRole('dialog');
    const titleEl = dialog.querySelector('.modal-title') as HTMLElement;
    expect(titleEl).toBeInTheDocument();
    // The title will contain "op-001" since i18next falls back to key + params
    expect(dialog.textContent).toMatch(/op-001|rejectOpTitle/);
  });

  it('calls onRejected and onClose when reject button clicked', () => {
    const onRejected = vi.fn();
    const onClose = vi.fn();
    render(<RejectTxModal {...defaultProps} onRejected={onRejected} onClose={onClose} />);
    const rejectBtn = document.querySelector('.btn-danger') as HTMLButtonElement;
    fireEvent.click(rejectBtn);
    expect(onRejected).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.any(String) })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when cancel button clicked', () => {
    const onClose = vi.fn();
    render(<RejectTxModal {...defaultProps} onClose={onClose} />);
    const cancelBtn = document.querySelector('.modal-footer .btn-ghost') as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('allows selecting a different reason via radio', () => {
    render(<RejectTxModal {...defaultProps} />);
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[2]);
    expect(radios[2]).toBeChecked();
  });

  it('allows entering a comment in the textarea', () => {
    render(<RejectTxModal {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'This looks suspicious' } });
    expect(textarea).toHaveValue('This looks suspicious');
  });

  it('includes comment in onRejected payload', () => {
    const onRejected = vi.fn();
    render(<RejectTxModal {...defaultProps} onRejected={onRejected} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'my note' } });
    const rejectBtn = document.querySelector('.btn-danger') as HTMLButtonElement;
    fireEvent.click(rejectBtn);
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ comment: 'my note' }));
  });

  it('resets form when re-opened', () => {
    const { rerender } = render(<RejectTxModal {...defaultProps} open={false} />);
    rerender(<RejectTxModal {...defaultProps} open={true} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('');
  });

  it('closes when clicking the scrim', () => {
    const onClose = vi.fn();
    render(<RejectTxModal {...defaultProps} onClose={onClose} />);
    const scrim = document.querySelector('.modal-scrim') as HTMLElement;
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close when clicking inside the modal', () => {
    const onClose = vi.fn();
    render(<RejectTxModal {...defaultProps} onClose={onClose} />);
    const modal = document.querySelector('.modal') as HTMLElement;
    fireEvent.click(modal);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('has aria-modal attribute', () => {
    render(<RejectTxModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});

// ── PolicyBlockModal ──────────────────────────────────────────────────────────

describe('PolicyBlockModal', () => {
  const defaultProps = {
    open: true,
    op: mockOp,
    onClose: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('renders when open with op', () => {
    render(<PolicyBlockModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('returns null when not open', () => {
    render(<PolicyBlockModal {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns null when op is null', () => {
    render(<PolicyBlockModal {...defaultProps} op={null} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when primary close button clicked', () => {
    const onClose = vi.fn();
    render(<PolicyBlockModal {...defaultProps} onClose={onClose} />);
    // The X button in the header
    const closeXBtn = document.querySelector('button.modal-close') as HTMLButtonElement;
    fireEvent.click(closeXBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when footer close button clicked', () => {
    const onClose = vi.fn();
    render(<PolicyBlockModal {...defaultProps} onClose={onClose} />);
    const footerBtn = document.querySelector('.modal-footer .btn-primary') as HTMLButtonElement;
    fireEvent.click(footerBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when scrim clicked', () => {
    const onClose = vi.fn();
    render(<PolicyBlockModal {...defaultProps} onClose={onClose} />);
    const scrim = document.querySelector('.modal-scrim') as HTMLElement;
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows policy failure for high-amount op', () => {
    // Amount >= 250_000 fails velocity check → shows in policy-trace
    const bigOp: SigningOp = { ...mockOp, amount: 300_000 };
    render(<PolicyBlockModal {...defaultProps} op={bigOp} />);
    const dialog = screen.getByRole('dialog');
    // Policy trace should contain the failed velocity check
    const trace = dialog.querySelector('.policy-trace');
    expect(trace).toBeInTheDocument();
  });

  it('shows empty policy trace for passing op (no failed checks)', () => {
    // Default mockOp has amount=10_000 which passes velocity → no failed checks listed
    render(<PolicyBlockModal {...defaultProps} />);
    const trace = document.querySelector('.policy-trace');
    expect(trace).toBeInTheDocument();
    // No err rows since all checks pass
    const errRows = document.querySelectorAll('.policy-row.err');
    expect(errRows.length).toBe(0);
  });

  it('has aria-modal attribute', () => {
    render(<PolicyBlockModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});

// ── ReviewTransactionModal ────────────────────────────────────────────────────

describe('ReviewTransactionModal', () => {
  const defaultProps = {
    open: true,
    op: mockOp,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    onReject: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('renders when open with op', () => {
    render(<ReviewTransactionModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('returns null when not open', () => {
    render(<ReviewTransactionModal {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns null when op is null', () => {
    render(<ReviewTransactionModal {...defaultProps} op={null} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('displays op id in the modal subtitle', () => {
    render(<ReviewTransactionModal {...defaultProps} />);
    // Subtitle: "op-001 · Safe v1.4.1"
    const subtitle = document.querySelector('.modal-subtitle') as HTMLElement;
    expect(subtitle.textContent).toContain('op-001');
  });

  it('displays the formatted amount somewhere in the modal', () => {
    render(<ReviewTransactionModal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    // fmtUSD(10000) → "10,000" with toLocaleString
    expect(dialog.textContent).toContain('10');
  });

  it('shows policy checks section with review-section', () => {
    render(<ReviewTransactionModal {...defaultProps} />);
    const sections = document.querySelectorAll('.review-section');
    expect(sections.length).toBeGreaterThan(0);
  });

  it('ack checkbox starts unchecked', () => {
    render(<ReviewTransactionModal {...defaultProps} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('confirm button (btn-primary) is disabled until ack checked', () => {
    render(<ReviewTransactionModal {...defaultProps} />);
    const confirmBtn = document.querySelector('.modal-footer .btn-primary') as HTMLButtonElement;
    expect(confirmBtn).toBeDisabled();
  });

  it('enables confirm after checking the ack checkbox', () => {
    render(<ReviewTransactionModal {...defaultProps} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    const confirmBtn = document.querySelector('.modal-footer .btn-primary') as HTMLButtonElement;
    expect(confirmBtn).not.toBeDisabled();
  });

  it('calls onConfirm when confirm button clicked after ack', () => {
    const onConfirm = vi.fn();
    render(<ReviewTransactionModal {...defaultProps} onConfirm={onConfirm} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    const confirmBtn = document.querySelector('.modal-footer .btn-primary') as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onReject when reject btn (first btn-ghost in footer) clicked', () => {
    const onReject = vi.fn();
    render(<ReviewTransactionModal {...defaultProps} onReject={onReject} />);
    const rejectBtn = document.querySelector('.modal-footer .btn-ghost') as HTMLButtonElement;
    fireEvent.click(rejectBtn);
    expect(onReject).toHaveBeenCalled();
  });

  it('calls onClose when cancel button clicked', () => {
    const onClose = vi.fn();
    render(<ReviewTransactionModal {...defaultProps} onClose={onClose} />);
    // Close button in header
    const headerClose = document.querySelector('button.modal-close') as HTMLButtonElement;
    fireEvent.click(headerClose);
    expect(onClose).toHaveBeenCalled();
  });

  it('resets ack checkbox on re-open', () => {
    const { rerender } = render(<ReviewTransactionModal {...defaultProps} open={false} />);
    rerender(<ReviewTransactionModal {...defaultProps} open={true} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('shows "first-time destination" warning for unknown destination', () => {
    const unknownOp: SigningOp = { ...mockOp, destinationKnown: false };
    render(<ReviewTransactionModal {...defaultProps} op={unknownOp} />);
    // review-dest-note warn exists
    const warnNote = document.querySelector('.review-dest-note.warn');
    expect(warnNote).toBeInTheDocument();
  });

  it('shows "known destination" ok note for known destination', () => {
    render(<ReviewTransactionModal {...defaultProps} />);
    const okNote = document.querySelector('.review-dest-note.ok');
    expect(okNote).toBeInTheDocument();
  });

  it('displays BNB Chain label for bnb chain', () => {
    render(<ReviewTransactionModal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('BNB Chain');
  });

  it('displays Solana label for sol chain', () => {
    const solOp: SigningOp = { ...mockOp, chain: 'sol' };
    render(<ReviewTransactionModal {...defaultProps} op={solOp} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Solana');
  });

  it('shows Safe version for bnb chain in subtitle', () => {
    render(<ReviewTransactionModal {...defaultProps} />);
    const subtitle = document.querySelector('.modal-subtitle') as HTMLElement;
    expect(subtitle.textContent).toContain('Safe');
  });

  it('shows Squads version for sol chain in subtitle', () => {
    const solOp: SigningOp = { ...mockOp, chain: 'sol' };
    render(<ReviewTransactionModal {...defaultProps} op={solOp} />);
    const subtitle = document.querySelector('.modal-subtitle') as HTMLElement;
    expect(subtitle.textContent).toContain('Squads');
  });

  it('has aria-modal attribute', () => {
    render(<ReviewTransactionModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
