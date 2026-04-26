import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconPolicyStrip } from '../recon-policy-strip';

vi.mock('@/icons', () => ({
  I: {
    Database: () => <span data-testid="icon-database" />,
    Check: () => <span data-testid="icon-check" />,
  },
}));

vi.mock('@/features/_shared/realtime', () => ({
  BlockTicker: ({ chain }: { chain: string }) => <span data-testid={`block-ticker-${chain}`} />,
}));

describe('ReconPolicyStrip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders policy strip wrapper', () => {
    render(<ReconPolicyStrip />);
    expect(document.querySelector('.policy-strip')).toBeInTheDocument();
  });

  it('renders scan cadence label', () => {
    render(<ReconPolicyStrip />);
    expect(screen.getByText('Scan:')).toBeInTheDocument();
  });

  it('renders scan cadence value', () => {
    render(<ReconPolicyStrip />);
    expect(screen.getByText('every 15m · cron')).toBeInTheDocument();
  });

  it('renders last pass label', () => {
    render(<ReconPolicyStrip />);
    expect(screen.getByText('Last pass:')).toBeInTheDocument();
  });

  it('renders last pass value', () => {
    render(<ReconPolicyStrip />);
    expect(screen.getByText('2m ago')).toBeInTheDocument();
  });

  it('renders BNB block ticker', () => {
    render(<ReconPolicyStrip />);
    expect(screen.getByTestId('block-ticker-bnb')).toBeInTheDocument();
  });

  it('renders SOL block ticker', () => {
    render(<ReconPolicyStrip />);
    expect(screen.getByTestId('block-ticker-sol')).toBeInTheDocument();
  });
});
