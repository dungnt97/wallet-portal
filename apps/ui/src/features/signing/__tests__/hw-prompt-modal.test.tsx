// Tests for features/signing/hw-prompt-modal.tsx — hardware attestation prompt.
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

// IS_DEV_MODE from signing-flow-broadcast — mock to control dev/prod mode
vi.mock('../signing-flow-broadcast', () => ({
  IS_DEV_MODE: true,
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HwPromptModal (dev mode)', () => {
  it('renders nothing when closed', () => {
    render(<HwPromptModal open={false} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('renders sheet when open', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
  });

  it('shows hw title', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByText('signing.hw.title')).toBeInTheDocument();
  });

  it('shows hw subtitle', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByTestId('subtitle').textContent).toBe('signing.hw.subtitle');
  });

  it('shows cancel button', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByText('common.cancel')).toBeInTheDocument();
  });

  it('calls onClose when cancel clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<HwPromptModal open={true} op={makeOp()} onClose={onClose} onAttested={vi.fn()} />);
    await user.click(screen.getByText('common.cancel').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows dev mode warning banner', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByText('signing.hw.devModeTitle')).toBeInTheDocument();
  });

  it('shows info alert', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByText('signing.hw.infoTitle')).toBeInTheDocument();
    expect(screen.getByText('signing.hw.infoBody')).toBeInTheDocument();
  });

  it('shows step instructions', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByText('signing.hw.step1')).toBeInTheDocument();
    expect(screen.getByText('signing.hw.step2')).toBeInTheDocument();
    expect(screen.getByText('signing.hw.step3')).toBeInTheDocument();
  });

  it('shows acknowledgement checkbox', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByText('signing.hw.ack')).toBeInTheDocument();
  });

  it('confirm button is disabled before checkbox ticked', () => {
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    expect(screen.getByText('signing.hw.confirm').closest('button')).toBeDisabled();
  });

  it('confirm button is enabled after checkbox ticked', async () => {
    const user = userEvent.setup();
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={vi.fn()} />);
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByText('signing.hw.confirm').closest('button')).not.toBeDisabled();
  });

  it('calls onAttested with synthetic blob in dev mode after confirm', async () => {
    const onAttested = vi.fn();
    const user = userEvent.setup();
    render(<HwPromptModal open={true} op={makeOp()} onClose={vi.fn()} onAttested={onAttested} />);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByText('signing.hw.confirm').closest('button') as HTMLElement);
    expect(onAttested).toHaveBeenCalledWith(expect.objectContaining({ type: 'ledger' }));
  });

  it('uses withdrawalId for blob when available', async () => {
    const onAttested = vi.fn();
    const user = userEvent.setup();
    render(
      <HwPromptModal
        open={true}
        op={makeOp({ withdrawalId: 'wd-007' })}
        onClose={vi.fn()}
        onAttested={onAttested}
      />
    );
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByText('signing.hw.confirm').closest('button') as HTMLElement);
    const call = onAttested.mock.calls[0][0];
    expect(call.blob).toBe(btoa('DEV_ATTESTATION_wd-007'));
  });

  it('uses op.id for blob when withdrawalId is null', async () => {
    const onAttested = vi.fn();
    const user = userEvent.setup();
    render(
      <HwPromptModal
        open={true}
        op={makeOp({ id: 'op-fallback', withdrawalId: null as unknown as string })}
        onClose={vi.fn()}
        onAttested={onAttested}
      />
    );
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByText('signing.hw.confirm').closest('button') as HTMLElement);
    const call = onAttested.mock.calls[0][0];
    expect(call.blob).toBe(btoa('DEV_ATTESTATION_op-fallback'));
  });
});
