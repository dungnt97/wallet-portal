import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPolicyStrip } from '../dashboard-policy-strip';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('@/icons', () => ({
  I: {
    Shield: () => <span data-testid="icon-shield" />,
    Database: () => <span data-testid="icon-database" />,
    Activity: () => <span data-testid="icon-activity" />,
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
  LiveTimeAgo: ({ at }: { at: string }) => <span data-testid="live-time-ago">{at}</span>,
  BlockTicker: ({ chain }: { chain: string }) => <span data-testid={`block-ticker-${chain}`} />,
}));

describe('DashboardPolicyStrip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders policy strip wrapper', () => {
    render(<DashboardPolicyStrip />);
    expect(document.querySelector('.policy-strip')).toBeInTheDocument();
  });

  it('renders withdrawal policy label', () => {
    render(<DashboardPolicyStrip />);
    expect(screen.getByText('dashboard.withdrawalPolicy')).toBeInTheDocument();
  });

  it('renders HSM label', () => {
    render(<DashboardPolicyStrip />);
    expect(screen.getByText('dashboard.hsm')).toBeInTheDocument();
  });

  it('shows AWS CloudHSM', () => {
    render(<DashboardPolicyStrip />);
    expect(screen.getByText('AWS CloudHSM')).toBeInTheDocument();
  });

  it('renders reconciliation label', () => {
    render(<DashboardPolicyStrip />);
    expect(screen.getByText('dashboard.recon')).toBeInTheDocument();
  });

  it('renders live dot for HSM active status', () => {
    render(<DashboardPolicyStrip />);
    expect(screen.getByTestId('live-dot')).toBeInTheDocument();
  });

  it('renders LiveTimeAgo for last reconciliation run', () => {
    render(<DashboardPolicyStrip />);
    expect(screen.getByTestId('live-time-ago')).toBeInTheDocument();
  });

  it('renders BNB block ticker', () => {
    render(<DashboardPolicyStrip />);
    expect(screen.getByTestId('block-ticker-bnb')).toBeInTheDocument();
  });

  it('renders SOL block ticker', () => {
    render(<DashboardPolicyStrip />);
    expect(screen.getByTestId('block-ticker-sol')).toBeInTheDocument();
  });
});
