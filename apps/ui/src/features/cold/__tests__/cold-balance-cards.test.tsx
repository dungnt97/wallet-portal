// Tests for features/cold/cold-balance-cards.tsx — ColdBalanceCards grouping and display.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ColdBalanceCards } from '../cold-balance-cards';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/icons', () => ({
  I: {
    Clock: () => <span data-testid="icon-clock" />,
    ArrowRight: () => <span data-testid="icon-arrow-right" />,
  },
}));

vi.mock('@/components/custody', () => ({
  ChainPill: ({ chain }: { chain: string }) => (
    <span data-testid={`chain-pill-${chain}`}>{chain}</span>
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BNB_HOT_USDT = {
  chain: 'bnb' as const,
  tier: 'hot' as const,
  address: '0xBnbHotAddr',
  token: 'USDT' as const,
  balance: String(500n * BigInt(1e18)),
  stale: false,
};

const BNB_COLD_USDT = {
  chain: 'bnb' as const,
  tier: 'cold' as const,
  address: '0xBnbColdAddr',
  token: 'USDT' as const,
  balance: String(1000n * BigInt(1e18)),
  stale: false,
};

const SOL_HOT_USDC = {
  chain: 'sol' as const,
  tier: 'hot' as const,
  address: 'SolHotAddr1234567890',
  token: 'USDC' as const,
  balance: String(200 * 1e6),
  stale: false,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ColdBalanceCards', () => {
  it('renders nothing when entries is empty', () => {
    const { container } = render(
      <ColdBalanceCards entries={[]} canRebalance={false} onRebalance={vi.fn()} />
    );
    // Outer div still renders but has no child cards
    expect(container.querySelectorAll('.card').length).toBe(0);
  });

  it('renders one card per chain:tier group', () => {
    render(
      <ColdBalanceCards
        entries={[BNB_HOT_USDT, BNB_COLD_USDT]}
        canRebalance={false}
        onRebalance={vi.fn()}
      />
    );
    expect(document.querySelectorAll('.card').length).toBe(2);
  });

  it('renders chain pills for each group', () => {
    render(
      <ColdBalanceCards
        entries={[BNB_HOT_USDT, SOL_HOT_USDC]}
        canRebalance={false}
        onRebalance={vi.fn()}
      />
    );
    expect(screen.getByTestId('chain-pill-bnb')).toBeInTheDocument();
    expect(screen.getByTestId('chain-pill-sol')).toBeInTheDocument();
  });

  it('renders hot tier label', () => {
    render(
      <ColdBalanceCards entries={[BNB_HOT_USDT]} canRebalance={false} onRebalance={vi.fn()} />
    );
    // t('cold.tierHot') is combined in a span with the chain name
    expect(screen.getByText(/cold\.tierHot/)).toBeInTheDocument();
  });

  it('renders cold tier label', () => {
    render(
      <ColdBalanceCards entries={[BNB_COLD_USDT]} canRebalance={false} onRebalance={vi.fn()} />
    );
    // t('cold.tierCold') is combined in a span with the chain name
    expect(screen.getByText(/cold\.tierCold/)).toBeInTheDocument();
  });

  it('renders token sub-rows', () => {
    render(
      <ColdBalanceCards entries={[BNB_HOT_USDT]} canRebalance={false} onRebalance={vi.fn()} />
    );
    expect(screen.getByText('USDT')).toBeInTheDocument();
  });

  it('shows stale badge when entry is stale', () => {
    const staleEntry = { ...BNB_HOT_USDT, stale: true };
    render(<ColdBalanceCards entries={[staleEntry]} canRebalance={false} onRebalance={vi.fn()} />);
    expect(screen.getByTestId('icon-clock')).toBeInTheDocument();
    expect(screen.getByText('cold.stale')).toBeInTheDocument();
  });

  it('does not show stale badge when entry is not stale', () => {
    render(
      <ColdBalanceCards entries={[BNB_HOT_USDT]} canRebalance={false} onRebalance={vi.fn()} />
    );
    expect(screen.queryByTestId('icon-clock')).not.toBeInTheDocument();
  });

  it('shows rebalance button on hot card when canRebalance=true', () => {
    render(<ColdBalanceCards entries={[BNB_HOT_USDT]} canRebalance={true} onRebalance={vi.fn()} />);
    expect(screen.getByRole('button', { name: /rebalance\.hotToCold/i })).toBeInTheDocument();
  });

  it('does not show rebalance button when canRebalance=false', () => {
    render(
      <ColdBalanceCards entries={[BNB_HOT_USDT]} canRebalance={false} onRebalance={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /rebalance\.hotToCold/i })).not.toBeInTheDocument();
  });

  it('does not show rebalance button on cold tier even when canRebalance=true', () => {
    render(
      <ColdBalanceCards entries={[BNB_COLD_USDT]} canRebalance={true} onRebalance={vi.fn()} />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onRebalance with chain when rebalance button clicked', async () => {
    const onRebalance = vi.fn();
    const user = userEvent.setup();
    render(
      <ColdBalanceCards entries={[BNB_HOT_USDT]} canRebalance={true} onRebalance={onRebalance} />
    );
    await user.click(screen.getByRole('button', { name: /rebalance\.hotToCold/i }));
    expect(onRebalance).toHaveBeenCalledWith('bnb');
  });

  it('renders BNB label for bnb chain', () => {
    render(
      <ColdBalanceCards entries={[BNB_HOT_USDT]} canRebalance={false} onRebalance={vi.fn()} />
    );
    expect(screen.getByText(/BNB/)).toBeInTheDocument();
  });

  it('renders Solana label for sol chain', () => {
    render(
      <ColdBalanceCards entries={[SOL_HOT_USDC]} canRebalance={false} onRebalance={vi.fn()} />
    );
    expect(screen.getByText(/Solana/)).toBeInTheDocument();
  });
});
