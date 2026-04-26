// Tests for hw-prompt-modal.tsx in prod mode (IS_DEV_MODE=false, VITE_HW_ATTESTATION_ENABLED unset).
// Covers lines 50-67 (no-attestation guard) and 109-118 (error alert banner).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('@/components/overlays', () => ({
  Sheet: ({
    open,
    onClose,
    title,
    subtitle,
    footer,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="sheet">
        <h2>{title}</h2>
        {subtitle && <p data-testid="subtitle">{subtitle}</p>}
        <div data-testid="footer">{footer}</div>
        <button type="button" data-testid="sheet-close" onClick={onClose}>
          close
        </button>
        {children}
      </div>
    ) : null,
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

// Prod mode: IS_DEV_MODE = false, IS_HW_ATTESTATION_ENABLED = false (default)
vi.mock('../signing-flow-broadcast', () => ({
  IS_DEV_MODE: false,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { HwPromptModal } from '../hw-prompt-modal';
import type { SigningOp } from '../signing-flow-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOp(overrides: Partial<SigningOp> = {}): SigningOp {
  return {
    id: 'op-001',
    chain: 'bnb',
    token: 'USDT',
    amount: 1000,
    destination: '0xdest',
    withdrawalId: 'wd-001',
    signaturesRequired: 2,
    totalSigners: 3,
    ...overrides,
  };
}

// ── Tests (prod mode) ─────────────────────────────────────────────────────────

describe('HwPromptModal (prod mode — attestation not enabled)', () => {
  it('renders sheet when open in prod mode', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
  });

  it('does NOT show dev mode banner in prod mode', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.queryByText('signing.hw.devModeTitle')).not.toBeInTheDocument();
  });

  it('shows hardware attestation not enabled alert', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByText('Hardware attestation not yet enabled')).toBeInTheDocument();
  });

  it('shows the not-enabled description text', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByText(/Cold-tier withdrawals require hardware wallet/)).toBeInTheDocument();
  });

  it('confirm button is disabled when attestation not enabled', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByText('signing.hw.confirm').closest('button')).toBeDisabled();
  });

  it('clicking confirm when disabled does not call onAttested (no-op guard)', async () => {
    const onAttested = vi.fn();
    const user = userEvent.setup();
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={onAttested} />);
    // checkbox ticked but button should still be disabled (IS_HW_ATTESTATION_ENABLED=false)
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    // Button remains disabled in prod mode without attestation enabled
    expect(screen.getByText('signing.hw.confirm').closest('button')).toBeDisabled();
    expect(onAttested).not.toHaveBeenCalled();
  });
});
