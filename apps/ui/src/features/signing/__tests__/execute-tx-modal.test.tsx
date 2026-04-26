// Tests for features/signing/execute-tx-modal.tsx — broadcast confirmation modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
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

vi.mock('@/lib/format', () => ({
  fmtUSD: (n: number) => n.toFixed(2),
  shortHash: (hash: string, _a: number, _b: number) => `${hash.slice(0, 6)}…${hash.slice(-4)}`,
}));

vi.mock('@/features/_shared/helpers', () => ({
  explorerUrl: (_chain: string, hash: string) => `https://explorer.example.com/tx/${hash}`,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { ExecuteTxModal } from '../execute-tx-modal';
import type { BroadcastResult, SigningOp } from '../signing-flow';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOp(overrides: Partial<SigningOp> = {}): SigningOp {
  return {
    id: 'op-abc-001',
    chain: 'bnb',
    token: 'USDT',
    amount: 2500,
    destination: '0xdestination1234567890',
    withdrawalId: 'wd-001',
    signaturesRequired: 2,
    totalSigners: 3,
    ...overrides,
  };
}

function makeBroadcast(overrides: Partial<BroadcastResult> = {}): BroadcastResult {
  return {
    hash: '0xhashABCDEF1234567890abcdef',
    blockNumber: 12_345_678,
    confirmedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExecuteTxModal', () => {
  it('renders nothing when open=false', () => {
    render(<ExecuteTxModal open={false} op={makeOp()} broadcast={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders nothing when op=null', () => {
    render(<ExecuteTxModal open={true} op={null} broadcast={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal dialog when open and op provided', () => {
    render(<ExecuteTxModal open={true} op={makeOp()} broadcast={null} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows broadcasting title while waiting', () => {
    render(<ExecuteTxModal open={true} op={makeOp()} broadcast={null} onClose={vi.fn()} />);
    expect(screen.getByText('signing.broadcasting')).toBeInTheDocument();
  });

  it('shows op id in subtitle', () => {
    render(<ExecuteTxModal open={true} op={makeOp()} broadcast={null} onClose={vi.fn()} />);
    expect(screen.getByText(/op-abc-001/)).toBeInTheDocument();
  });

  it('shows thresholdMet text', () => {
    render(<ExecuteTxModal open={true} op={makeOp()} broadcast={null} onClose={vi.fn()} />);
    expect(screen.getByText(/signing\.thresholdMet/)).toBeInTheDocument();
  });

  it('shows waiting network text while broadcasting', () => {
    render(<ExecuteTxModal open={true} op={makeOp()} broadcast={null} onClose={vi.fn()} />);
    expect(screen.getByText('signing.waitingNetwork')).toBeInTheDocument();
  });

  it('shows BNB chain name for bnb chain', () => {
    render(
      <ExecuteTxModal
        open={true}
        op={makeOp({ chain: 'bnb' })}
        broadcast={null}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('BNB Smart Chain')).toBeInTheDocument();
  });

  it('shows Solana chain name for sol chain', () => {
    render(
      <ExecuteTxModal
        open={true}
        op={makeOp({ chain: 'sol' })}
        broadcast={null}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Solana Mainnet')).toBeInTheDocument();
  });

  it('shows amount and token', () => {
    render(
      <ExecuteTxModal
        open={true}
        op={makeOp({ amount: 2500, token: 'USDT' })}
        broadcast={null}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('$2500.00 USDT')).toBeInTheDocument();
  });

  it('shows BNB gas estimate for bnb chain', () => {
    render(
      <ExecuteTxModal
        open={true}
        op={makeOp({ chain: 'bnb' })}
        broadcast={null}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/0\.00042 BNB/)).toBeInTheDocument();
  });

  it('shows SOL gas estimate for sol chain', () => {
    render(
      <ExecuteTxModal
        open={true}
        op={makeOp({ chain: 'sol' })}
        broadcast={null}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/0\.000005 SOL/)).toBeInTheDocument();
  });

  it('does not show close button while broadcasting', () => {
    render(<ExecuteTxModal open={true} op={makeOp()} broadcast={null} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
  });

  it('shows confirmed title after broadcast', () => {
    render(
      <ExecuteTxModal open={true} op={makeOp()} broadcast={makeBroadcast()} onClose={vi.fn()} />
    );
    expect(screen.getByText('signing.txConfirmed')).toBeInTheDocument();
  });

  it('shows block number in confirmed title', () => {
    render(
      <ExecuteTxModal
        open={true}
        op={makeOp()}
        broadcast={makeBroadcast({ blockNumber: 12_345_678 })}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/signing\.confirmedAtBlock/)).toBeInTheDocument();
  });

  it('shows explorer link after broadcast', () => {
    render(
      <ExecuteTxModal
        open={true}
        op={makeOp()}
        broadcast={makeBroadcast({ hash: '0xhashABCDEF1234567890abcdef' })}
        onClose={vi.fn()}
      />
    );
    const link = screen.getByRole('link') as HTMLAnchorElement;
    expect(link.href).toBe('https://explorer.example.com/tx/0xhashABCDEF1234567890abcdef');
  });

  it('shows Done button after broadcast', () => {
    render(
      <ExecuteTxModal open={true} op={makeOp()} broadcast={makeBroadcast()} onClose={vi.fn()} />
    );
    expect(screen.getByText('signing.done')).toBeInTheDocument();
  });

  it('calls onClose when Done clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ExecuteTxModal open={true} op={makeOp()} broadcast={makeBroadcast()} onClose={onClose} />
    );
    await user.click(screen.getByText('signing.done'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows close button in header after broadcast', () => {
    render(
      <ExecuteTxModal open={true} op={makeOp()} broadcast={makeBroadcast()} onClose={vi.fn()} />
    );
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });

  it('calls onClose when header close button clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ExecuteTxModal open={true} op={makeOp()} broadcast={makeBroadcast()} onClose={onClose} />
    );
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
