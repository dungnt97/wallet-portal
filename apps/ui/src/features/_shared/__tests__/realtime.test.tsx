// Tests for features/_shared/realtime.tsx — LiveDot, LiveTimeAgo, BlockTicker.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUseOpsHealth = vi.fn();
const mockUseGasHistory = vi.fn();

vi.mock('@/api/queries', () => ({
  useOpsHealth: () => mockUseOpsHealth(),
}));

vi.mock('@/features/sweep/use-gas-history', () => ({
  useGasHistory: (chain: string) => mockUseGasHistory(chain),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { BlockTicker, LiveDot, LiveTimeAgo } from '../realtime';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHealth(bnbBlock = 1000, solBlock = 5000, bnbLag = 0, solLag = 0) {
  return {
    chains: [
      { id: 'bnb', latestBlock: bnbBlock, lagBlocks: bnbLag, rpc: 'https://bsc-rpc' },
      { id: 'sol', latestBlock: solBlock, lagBlocks: solLag, rpc: 'https://sol-rpc' },
    ],
  };
}

// ── LiveDot tests ─────────────────────────────────────────────────────────────

describe('LiveDot', () => {
  it('renders with default ok variant', () => {
    const { container } = render(<LiveDot />);
    expect(container.firstChild).toHaveClass('live-dot-ok');
  });

  it('renders with warn variant', () => {
    const { container } = render(<LiveDot variant="warn" />);
    expect(container.firstChild).toHaveClass('live-dot-warn');
  });

  it('renders with err variant', () => {
    const { container } = render(<LiveDot variant="err" />);
    expect(container.firstChild).toHaveClass('live-dot-err');
  });

  it('renders with muted variant', () => {
    const { container } = render(<LiveDot variant="muted" />);
    expect(container.firstChild).toHaveClass('live-dot-muted');
  });
});

// ── LiveTimeAgo tests ─────────────────────────────────────────────────────────

describe('LiveTimeAgo', () => {
  beforeEach(() => {
    mockUseOpsHealth.mockReturnValue({ data: undefined });
    mockUseGasHistory.mockReturnValue({ data: undefined });
  });

  it('shows seconds ago for recent timestamp', () => {
    const at = new Date(Date.now() - 30_000).toISOString();
    render(<LiveTimeAgo at={at} />);
    expect(screen.getByText(/s ago/)).toBeInTheDocument();
  });

  it('shows minutes ago for timestamp over 60s old', () => {
    const at = new Date(Date.now() - 5 * 60_000).toISOString();
    render(<LiveTimeAgo at={at} />);
    expect(screen.getByText(/m ago/)).toBeInTheDocument();
  });

  it('shows hours ago for timestamp over 3600s old', () => {
    const at = new Date(Date.now() - 2 * 3600_000).toISOString();
    render(<LiveTimeAgo at={at} />);
    expect(screen.getByText(/h ago/)).toBeInTheDocument();
  });

  it('shows days ago for timestamp over 86400s old', () => {
    const at = new Date(Date.now() - 3 * 86_400_000).toISOString();
    render(<LiveTimeAgo at={at} />);
    expect(screen.getByText(/d ago/)).toBeInTheDocument();
  });
});

// ── BlockTicker tests ─────────────────────────────────────────────────────────

describe('BlockTicker', () => {
  beforeEach(() => {
    mockUseOpsHealth.mockReturnValue({ data: undefined });
    mockUseGasHistory.mockReturnValue({ data: undefined });
  });

  it('shows BSC label for bnb chain', () => {
    render(<BlockTicker chain="bnb" />);
    expect(screen.getByText('BSC')).toBeInTheDocument();
  });

  it('shows SOL label for sol chain', () => {
    render(<BlockTicker chain="sol" />);
    expect(screen.getByText('SOL')).toBeInTheDocument();
  });

  it('shows dash when health data is not loaded', () => {
    render(<BlockTicker chain="bnb" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows block height when health data loaded', () => {
    mockUseOpsHealth.mockReturnValue({ data: makeHealth(42_000, 99_000) });
    render(<BlockTicker chain="bnb" />);
    expect(screen.getByText('42,000')).toBeInTheDocument();
  });

  it('shows sol block height', () => {
    mockUseOpsHealth.mockReturnValue({ data: makeHealth(1000, 99_999) });
    render(<BlockTicker chain="sol" />);
    expect(screen.getByText('99,999')).toBeInTheDocument();
  });

  it('shows lag behind when bnb lagBlocks > 0', () => {
    mockUseOpsHealth.mockReturnValue({ data: makeHealth(1000, 5000, 8, 0) });
    render(<BlockTicker chain="bnb" />);
    expect(screen.getByText('8 behind')).toBeInTheDocument();
  });

  it('does not show lag when lagBlocks=0', () => {
    mockUseOpsHealth.mockReturnValue({ data: makeHealth(1000, 5000, 0, 0) });
    render(<BlockTicker chain="bnb" />);
    expect(screen.queryByText(/behind/)).not.toBeInTheDocument();
  });

  it('uses ok dot variant when lagBlocks=0', () => {
    mockUseOpsHealth.mockReturnValue({ data: makeHealth(1000, 5000, 0, 0) });
    const { container } = render(<BlockTicker chain="bnb" />);
    expect(container.querySelector('.live-dot-ok')).toBeInTheDocument();
  });

  it('uses warn dot variant when lagBlocks is small (1-4)', () => {
    mockUseOpsHealth.mockReturnValue({ data: makeHealth(1000, 5000, 3, 0) });
    const { container } = render(<BlockTicker chain="bnb" />);
    expect(container.querySelector('.live-dot-warn')).toBeInTheDocument();
  });

  it('uses err dot variant when lagBlocks >= 5', () => {
    mockUseOpsHealth.mockReturnValue({ data: makeHealth(1000, 5000, 10, 0) });
    const { container } = render(<BlockTicker chain="bnb" />);
    expect(container.querySelector('.live-dot-err')).toBeInTheDocument();
  });
});
