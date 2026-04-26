import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WithdrawalsPolicyStrip } from '../withdrawals-policy-strip';

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

vi.mock('@/lib/constants', () => ({
  MULTISIG_POLICY: { required: 2, total: 3 },
}));

vi.mock('@/features/_shared/realtime', () => ({
  BlockTicker: ({ chain }: { chain: string }) => <span data-testid={`block-ticker-${chain}`} />,
  LiveDot: () => <span data-testid="live-dot" />,
}));

describe('WithdrawalsPolicyStrip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders policy strip wrapper', () => {
    render(<WithdrawalsPolicyStrip />);
    expect(document.querySelector('.policy-strip')).toBeInTheDocument();
  });

  it('renders withdrawal policy label', () => {
    render(<WithdrawalsPolicyStrip />);
    expect(screen.getByText('withdrawals.policy')).toBeInTheDocument();
  });

  it('renders HSM cosign label', () => {
    render(<WithdrawalsPolicyStrip />);
    expect(screen.getByText('withdrawals.hsmCosign')).toBeInTheDocument();
  });

  it('renders broadcast queue label', () => {
    render(<WithdrawalsPolicyStrip />);
    expect(screen.getByText('withdrawals.broadcastQueue')).toBeInTheDocument();
  });

  it('renders live dot', () => {
    render(<WithdrawalsPolicyStrip />);
    expect(screen.getByTestId('live-dot')).toBeInTheDocument();
  });

  it('renders BNB block ticker', () => {
    render(<WithdrawalsPolicyStrip />);
    expect(screen.getByTestId('block-ticker-bnb')).toBeInTheDocument();
  });

  it('renders SOL block ticker', () => {
    render(<WithdrawalsPolicyStrip />);
    expect(screen.getByTestId('block-ticker-sol')).toBeInTheDocument();
  });

  it('includes multisig policy counts in treasurers label', () => {
    render(<WithdrawalsPolicyStrip />);
    const text = document.querySelector('.policy-strip')?.textContent;
    expect(text).toContain('2');
    expect(text).toContain('3');
  });
});
