import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DepositsPolicyStrip } from '../deposits-policy-strip';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/icons', () => ({
  I: {
    ArrowDown: () => <span data-testid="icon-arrow-down" />,
    Activity: () => <span data-testid="icon-activity" />,
    Database: () => <span data-testid="icon-database" />,
  },
}));

vi.mock('@/features/_shared/realtime', () => ({
  useRealtime: () => ({
    now: Date.now(),
    blocks: { bnb: 100, sol: 200 },
    rpc: { bnb: { ms: 50, lagBlocks: 1 }, sol: { ms: 80, lagSlots: 2 } },
    gasPrice: { bnb: 3, sol: 0.001 },
  }),
  LiveDot: () => <span data-testid="live-dot" />,
  BlockTicker: ({ chain }: { chain: string }) => <span data-testid={`block-ticker-${chain}`} />,
}));

describe('DepositsPolicyStrip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders policy strip wrapper', () => {
    render(<DepositsPolicyStrip />);
    expect(document.querySelector('.policy-strip')).toBeInTheDocument();
  });

  it('renders confirmation thresholds label', () => {
    render(<DepositsPolicyStrip />);
    expect(screen.getByText('deposits.confirmsRequired')).toBeInTheDocument();
  });

  it('shows BNB and SOL confirmation counts', () => {
    render(<DepositsPolicyStrip />);
    expect(screen.getByText('BNB 12 · SOL 32')).toBeInTheDocument();
  });

  it('renders watcher status label', () => {
    render(<DepositsPolicyStrip />);
    expect(screen.getByText('deposits.watcher')).toBeInTheDocument();
  });

  it('renders live dot', () => {
    render(<DepositsPolicyStrip />);
    expect(screen.getByTestId('live-dot')).toBeInTheDocument();
  });

  it('renders HD derivation label', () => {
    render(<DepositsPolicyStrip />);
    expect(screen.getByText('deposits.hdDeriv')).toBeInTheDocument();
  });

  it('shows BIP-44 scheme', () => {
    render(<DepositsPolicyStrip />);
    expect(screen.getByText('BIP-44')).toBeInTheDocument();
  });

  it('renders BNB block ticker', () => {
    render(<DepositsPolicyStrip />);
    expect(screen.getByTestId('block-ticker-bnb')).toBeInTheDocument();
  });

  it('renders SOL block ticker', () => {
    render(<DepositsPolicyStrip />);
    expect(screen.getByTestId('block-ticker-sol')).toBeInTheDocument();
  });

  it('renders online label', () => {
    render(<DepositsPolicyStrip />);
    expect(screen.getByText('deposits.online')).toBeInTheDocument();
  });
});
