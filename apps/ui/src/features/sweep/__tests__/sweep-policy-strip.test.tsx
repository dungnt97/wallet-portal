import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SweepPolicyStrip } from '../sweep-policy-strip';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/icons', () => ({
  I: {
    Sweep: () => <span data-testid="icon-sweep" />,
    Lightning: () => <span data-testid="icon-lightning" />,
    Database: () => <span data-testid="icon-database" />,
  },
}));

vi.mock('@/features/_shared/realtime', () => ({
  BlockTicker: ({ chain }: { chain: string }) => <span data-testid={`block-ticker-${chain}`} />,
}));

describe('SweepPolicyStrip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders policy strip wrapper', () => {
    render(<SweepPolicyStrip />);
    expect(document.querySelector('.policy-strip')).toBeInTheDocument();
  });

  it('renders sweep policy label', () => {
    render(<SweepPolicyStrip />);
    expect(screen.getByText('sweep.policyLabel')).toBeInTheDocument();
  });

  it('renders sweep policy value', () => {
    render(<SweepPolicyStrip />);
    expect(screen.getByText('sweep.policyValue')).toBeInTheDocument();
  });

  it('renders gas topup label', () => {
    render(<SweepPolicyStrip />);
    expect(screen.getByText('sweep.gasTopupLabel')).toBeInTheDocument();
  });

  it('renders idempotency label', () => {
    render(<SweepPolicyStrip />);
    expect(screen.getByText('sweep.idempotencyLabel')).toBeInTheDocument();
  });

  it('renders BNB block ticker', () => {
    render(<SweepPolicyStrip />);
    expect(screen.getByTestId('block-ticker-bnb')).toBeInTheDocument();
  });

  it('renders SOL block ticker', () => {
    render(<SweepPolicyStrip />);
    expect(screen.getByTestId('block-ticker-sol')).toBeInTheDocument();
  });
});
