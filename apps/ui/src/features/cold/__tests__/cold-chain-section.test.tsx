// Smoke tests for features/cold/cold-chain-section.tsx — balance display, rebalance buttons.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, fallback?: string) => fallback ?? k }),
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

vi.mock('@/components/custody/chain-pill', () => ({
  ChainPill: ({ chain }: { chain: string }) => <span data-testid={`chain-pill-${chain}`} />,
}));

vi.mock('@/lib/constants', () => ({
  CHAINS: {
    bnb: { label: 'BNB Chain', short: 'BNB', color: '#F0B90B' },
    sol: { label: 'Solana', short: 'SOL', color: '#9945FF' },
  },
}));

vi.mock('@/lib/format', () => ({
  fmtUSD: (n: number) => n.toFixed(2),
  shortHash: (h: string, _a?: number, _b?: number) => h.slice(0, 6),
}));

vi.mock('../band-progress-bar', () => ({
  BandProgressBar: ({
    balanceUsd,
    floorUsd,
    ceilingUsd,
  }: {
    balanceUsd: number;
    floorUsd: number;
    ceilingUsd: number;
  }) => (
    <div data-testid="band-progress-bar">
      {balanceUsd}/{floorUsd}-{ceilingUsd}
    </div>
  ),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { ColdChainSection } from '../cold-chain-section';

// ── Helpers ───────────────────────────────────────────────────────────────────

const hotMeta = {
  id: 'wm1',
  chain: 'bnb' as const,
  tier: 'hot' as const,
  address: '0xHotAddress',
  bandFloorUsd: 50_000,
  bandCeilingUsd: 200_000,
  label: 'Hot BNB',
};

const coldMeta = {
  id: 'wm2',
  chain: 'bnb' as const,
  tier: 'cold' as const,
  address: '0xColdAddress',
  bandFloorUsd: 0,
  bandCeilingUsd: 0,
  label: 'Cold BNB',
};

const bnbBalances = [
  { chain: 'bnb', tier: 'hot', token: 'USDT', balance: '100000000000000000000000' }, // 100k USDT (18 dec)
  { chain: 'bnb', tier: 'cold', token: 'USDT', balance: '500000000000000000000000' }, // 500k USDT
];

function renderSection({
  chain = 'bnb' as const,
  balanceEntries = bnbBalances,
  hotM = hotMeta as typeof hotMeta | undefined,
  coldM = coldMeta as typeof coldMeta | undefined,
  canRebalance = true,
  onRebalance = vi.fn(),
} = {}) {
  return render(
    <ColdChainSection
      chain={chain}
      balanceEntries={balanceEntries}
      hotMeta={hotM}
      coldMeta={coldM}
      canRebalance={canRebalance}
      onRebalance={onRebalance}
    />
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ColdChainSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders band progress bar', () => {
    renderSection();
    expect(screen.getByTestId('band-progress-bar')).toBeInTheDocument();
  });

  it('renders hot→cold rebalance button', () => {
    renderSection();
    expect(screen.getByText('cold.hotToCold')).toBeInTheDocument();
  });

  it('renders cold→hot rebalance button', () => {
    renderSection();
    expect(screen.getByText('cold.coldToHot')).toBeInTheDocument();
  });

  it('calls onRebalance with hot→cold when button clicked', async () => {
    const onRebalance = vi.fn();
    const user = userEvent.setup();
    renderSection({ onRebalance });
    await user.click(screen.getByText('cold.hotToCold').closest('button') as HTMLElement);
    expect(onRebalance).toHaveBeenCalledWith('bnb', 'hot→cold');
  });

  it('calls onRebalance with cold→hot when button clicked', async () => {
    const onRebalance = vi.fn();
    const user = userEvent.setup();
    renderSection({ onRebalance });
    await user.click(screen.getByText('cold.coldToHot').closest('button') as HTMLElement);
    expect(onRebalance).toHaveBeenCalledWith('bnb', 'cold→hot');
  });

  it('disables rebalance buttons when canRebalance is false', () => {
    renderSection({ canRebalance: false });
    const btns = screen.getAllByRole('button');
    for (const btn of btns) {
      expect(btn).toBeDisabled();
    }
  });

  it('shows cold address truncated via shortHash', () => {
    renderSection();
    // shortHash('0xColdAddress', 8, 6) → '0xColdA' (first 6 chars of the mock)
    expect(screen.getByText('0xCold')).toBeInTheDocument();
  });

  it('renders chain pill', () => {
    renderSection();
    expect(screen.getByTestId('chain-pill-bnb')).toBeInTheDocument();
  });

  it('shows hot tier label', () => {
    renderSection();
    // Renders as "cold.tierHot · BSC HOT WALLET"
    expect(screen.getByText(/cold\.tierHot/)).toBeInTheDocument();
  });

  it('renders without crashing when no hotMeta', () => {
    // Without hotMeta, bandFloor/Ceiling = 0 so hasBand = false → no BandProgressBar
    renderSection({ hotM: undefined });
    // Basic render check — no exception thrown
    expect(screen.getByText('cold.hotToCold')).toBeInTheDocument();
  });
});
