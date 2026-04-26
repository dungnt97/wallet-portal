// Smoke tests for signing-flow-host.tsx
// Tests: renders correct modal per flow step, hwPrompt insertion for cold-tier ops,
// onComplete callback when step=done, cancel/reset wiring.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

// ── Child modal mocks ─────────────────────────────────────────────────────────

vi.mock('../review-transaction-modal', () => ({
  ReviewTransactionModal: ({
    open,
    onConfirm,
    onClose,
    onReject,
  }: {
    open: boolean;
    op: unknown;
    onConfirm: () => void;
    onClose: () => void;
    onReject: () => void;
  }) =>
    open ? (
      <div data-testid="review-modal">
        <button type="button" onClick={onConfirm}>
          confirm-review
        </button>
        <button type="button" onClick={onClose}>
          close-review
        </button>
        <button type="button" onClick={onReject}>
          reject-review
        </button>
      </div>
    ) : null,
}));

vi.mock('../hw-prompt-modal', () => ({
  HwPromptModal: ({
    open,
    onClose,
    onAttested,
  }: {
    open: boolean;
    op: unknown;
    onClose: () => void;
    onAttested: (a: unknown) => void;
  }) =>
    open ? (
      <div data-testid="hw-prompt-modal">
        <button type="button" onClick={() => onAttested({ ledgerSignature: 'abc' })}>
          attest-hw
        </button>
        <button type="button" onClick={onClose}>
          close-hw
        </button>
      </div>
    ) : null,
}));

vi.mock('../policy-block-modal', () => ({
  PolicyBlockModal: ({ open, onClose }: { open: boolean; op: unknown; onClose: () => void }) =>
    open ? (
      <div data-testid="policy-block-modal">
        <button type="button" onClick={onClose}>
          close-policy-block
        </button>
      </div>
    ) : null,
}));

vi.mock('../wallet-sign-popup', () => ({
  WalletSignPopup: ({
    open,
    onSigned,
    onRejected,
    onClose,
  }: {
    open: boolean;
    op: unknown;
    onSigned: (sig: unknown) => void;
    onRejected: () => void;
    onClose: () => void;
    onBroadcastComplete?: (r: unknown) => void;
    onBroadcastFailed?: (e: string) => void;
    onNeedConnect?: () => void;
  }) =>
    open ? (
      <div data-testid="wallet-sign-popup">
        <button
          type="button"
          onClick={() => onSigned({ signer: '0x1', signature: '0xsig', at: '2024-01-01' })}
        >
          sign-wallet
        </button>
        <button type="button" onClick={onRejected}>
          reject-wallet
        </button>
        <button type="button" onClick={onClose}>
          close-wallet
        </button>
      </div>
    ) : null,
}));

vi.mock('../step-up-modal', () => ({
  StepUpModal: ({
    open,
    onClose,
    onVerified,
    onUseOtpFallback,
  }: {
    open: boolean;
    op: unknown;
    onClose: () => void;
    onVerified: (r: unknown) => void;
    onUseOtpFallback: () => void;
  }) =>
    open ? (
      <div data-testid="step-up-modal">
        <button type="button" onClick={() => onVerified({ token: 'webauthn-token' })}>
          verify-step-up
        </button>
        <button type="button" onClick={onUseOtpFallback}>
          use-otp-fallback
        </button>
        <button type="button" onClick={onClose}>
          close-step-up
        </button>
      </div>
    ) : null,
}));

vi.mock('../otp-modal', () => ({
  OtpModal: ({
    open,
    onClose,
    onVerified,
    onBackToStepUp,
  }: {
    open: boolean;
    op: unknown;
    onClose: () => void;
    onVerified: (r: unknown) => void;
    onBackToStepUp: () => void;
  }) =>
    open ? (
      <div data-testid="otp-modal">
        <button type="button" onClick={() => onVerified({ token: 'otp-token' })}>
          verify-otp
        </button>
        <button type="button" onClick={onBackToStepUp}>
          back-to-step-up
        </button>
        <button type="button" onClick={onClose}>
          close-otp
        </button>
      </div>
    ) : null,
}));

vi.mock('../execute-tx-modal', () => ({
  ExecuteTxModal: ({
    open,
    onClose,
  }: {
    open: boolean;
    op: unknown;
    broadcast: unknown;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="execute-tx-modal">
        <button type="button" onClick={onClose}>
          close-execute
        </button>
      </div>
    ) : null,
}));

vi.mock('../reject-tx-modal', () => ({
  RejectTxModal: ({
    open,
    onClose,
    onRejected,
  }: {
    open: boolean;
    op: unknown;
    onClose: () => void;
    onRejected: (r: unknown) => void;
  }) =>
    open ? (
      <div data-testid="reject-tx-modal">
        <button
          type="button"
          onClick={() => onRejected({ reason: 'User rejected', at: '2024-01-01' })}
        >
          confirm-reject
        </button>
        <button type="button" onClick={onClose}>
          close-reject
        </button>
      </div>
    ) : null,
}));

vi.mock('@/shell/connect-wallet-modal', () => ({
  ConnectWalletModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="connect-wallet-modal">
        <button type="button" onClick={onClose}>
          close-connect
        </button>
      </div>
    ) : null,
}));

// ── Mock signing flow ─────────────────────────────────────────────────────────

import type { SigningFlow } from '../signing-flow';
import type { SigningOp } from '../signing-flow-types';

// Import after mocks
import { SigningFlowHost } from '../signing-flow-host';

// ── Helpers ───────────────────────────────────────────────────────────────────

const HOT_OP: SigningOp = {
  id: 'op-001',
  chain: 'bnb',
  token: 'USDT',
  amount: 1000,
  destination: '0xDest',
  signaturesRequired: 2,
  totalSigners: 3,
  sourceTier: 'hot',
  withdrawalId: 'wd-001',
};

const COLD_OP: SigningOp = {
  ...HOT_OP,
  id: 'op-002',
  sourceTier: 'cold',
};

function makeFlow(step: string, overrides: Partial<SigningFlow> = {}): SigningFlow {
  const state = {
    step,
    op: HOT_OP,
    signature: null,
    stepUp: null,
    broadcast: null,
    error: null,
    rejectReason: null,
    hwAttestation: null,
  };
  return {
    state,
    start: vi.fn(),
    confirmReview: vi.fn(),
    walletSigned: vi.fn(),
    stepUpPassed: vi.fn().mockResolvedValue(undefined),
    useOtpFallback: vi.fn(),
    otpVerified: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    reset: vi.fn(),
    broadcastComplete: vi.fn(),
    broadcastFailed: vi.fn(),
    reject: vi.fn(),
    hwAttested: vi.fn(),
    ...overrides,
  } as unknown as SigningFlow;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SigningFlowHost', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders review modal when step=review', () => {
    const flow = makeFlow('review');
    render(<SigningFlowHost flow={flow} />);
    expect(screen.getByTestId('review-modal')).toBeInTheDocument();
  });

  it('does not render review modal when step=idle', () => {
    const flow = makeFlow('idle');
    render(<SigningFlowHost flow={flow} />);
    expect(screen.queryByTestId('review-modal')).not.toBeInTheDocument();
  });

  it('renders wallet-sign popup when step=wallet-sign', () => {
    const flow = makeFlow('wallet-sign');
    render(<SigningFlowHost flow={flow} />);
    expect(screen.getByTestId('wallet-sign-popup')).toBeInTheDocument();
  });

  it('renders policy-block modal when step=policy-block', () => {
    const flow = makeFlow('policy-block');
    render(<SigningFlowHost flow={flow} />);
    expect(screen.getByTestId('policy-block-modal')).toBeInTheDocument();
  });

  it('renders step-up modal when step=step-up', () => {
    const flow = makeFlow('step-up');
    render(<SigningFlowHost flow={flow} />);
    expect(screen.getByTestId('step-up-modal')).toBeInTheDocument();
  });

  it('renders otp modal when step=otp', () => {
    const flow = makeFlow('otp');
    render(<SigningFlowHost flow={flow} />);
    expect(screen.getByTestId('otp-modal')).toBeInTheDocument();
  });

  it('renders execute modal when step=execute', () => {
    const flow = makeFlow('execute');
    render(<SigningFlowHost flow={flow} />);
    expect(screen.getByTestId('execute-tx-modal')).toBeInTheDocument();
  });

  it('renders execute modal when step=done (same modal)', () => {
    const onComplete = vi.fn();
    const flow = makeFlow('done');
    render(<SigningFlowHost flow={flow} onComplete={onComplete} />);
    expect(screen.getByTestId('execute-tx-modal')).toBeInTheDocument();
  });

  it('calls onComplete when step transitions to done', () => {
    const onComplete = vi.fn();
    const flow = makeFlow('done');
    render(<SigningFlowHost flow={flow} onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('renders reject modal when step=rejected', () => {
    const flow = makeFlow('rejected');
    render(<SigningFlowHost flow={flow} />);
    expect(screen.getByTestId('reject-tx-modal')).toBeInTheDocument();
  });

  it('calls confirmReview on review confirm for hot-tier op', async () => {
    const user = userEvent.setup();
    const flow = makeFlow('review');
    render(<SigningFlowHost flow={flow} />);
    await user.click(screen.getByText('confirm-review'));
    expect(flow.confirmReview).toHaveBeenCalled();
  });

  it('opens hw-prompt modal on review confirm for cold-tier op without attestation', async () => {
    const user = userEvent.setup();
    const flow = makeFlow('review', {
      state: {
        step: 'review',
        op: COLD_OP,
        signature: null,
        stepUp: null,
        broadcast: null,
        error: null,
        rejectReason: null,
        hwAttestation: null,
      },
    } as Partial<SigningFlow>);
    render(<SigningFlowHost flow={flow} />);
    await user.click(screen.getByText('confirm-review'));
    // hw-prompt modal should open; confirmReview not yet called
    expect(screen.getByTestId('hw-prompt-modal')).toBeInTheDocument();
    expect(flow.confirmReview).not.toHaveBeenCalled();
  });

  it('calls hwAttested and closes hw-prompt when attested', async () => {
    const user = userEvent.setup();
    const flow = makeFlow('review', {
      state: {
        step: 'review',
        op: COLD_OP,
        signature: null,
        stepUp: null,
        broadcast: null,
        error: null,
        rejectReason: null,
        hwAttestation: null,
      },
    } as Partial<SigningFlow>);
    render(<SigningFlowHost flow={flow} />);
    await user.click(screen.getByText('confirm-review'));
    await user.click(screen.getByText('attest-hw'));
    expect(flow.hwAttested).toHaveBeenCalledWith({ ledgerSignature: 'abc' });
  });

  it('calls cancel when review closed', async () => {
    const user = userEvent.setup();
    const flow = makeFlow('review');
    render(<SigningFlowHost flow={flow} />);
    await user.click(screen.getByText('close-review'));
    expect(flow.cancel).toHaveBeenCalled();
  });

  it('calls reject on reject-review button', async () => {
    const user = userEvent.setup();
    const flow = makeFlow('review');
    render(<SigningFlowHost flow={flow} />);
    await user.click(screen.getByText('reject-review'));
    expect(flow.reject).toHaveBeenCalledWith('User rejected on review');
  });

  it('calls walletSigned on sign button in wallet popup', async () => {
    const user = userEvent.setup();
    const flow = makeFlow('wallet-sign');
    render(<SigningFlowHost flow={flow} />);
    await user.click(screen.getByText('sign-wallet'));
    expect(flow.walletSigned).toHaveBeenCalled();
  });

  it('calls reject on reject in wallet popup', async () => {
    const user = userEvent.setup();
    const flow = makeFlow('wallet-sign');
    render(<SigningFlowHost flow={flow} />);
    await user.click(screen.getByText('reject-wallet'));
    expect(flow.reject).toHaveBeenCalledWith('User rejected in wallet popup');
  });

  it('calls onRejected callback after reject tx modal confirms', async () => {
    const user = userEvent.setup();
    const onRejected = vi.fn();
    const flow = makeFlow('rejected');
    render(<SigningFlowHost flow={flow} onRejected={onRejected} />);
    await user.click(screen.getByText('confirm-reject'));
    expect(onRejected).toHaveBeenCalled();
  });
});
