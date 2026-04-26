// Smoke tests for features/cold/cold-page.tsx — loading, error, rebalance modal.
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
        ({ size, className }: { size?: number; className?: string }) => (
          <span data-testid={`icon-${String(key)}`} data-size={size} className={className} />
        ),
    }
  ),
}));

const mockToast = vi.fn();
vi.mock('@/components/overlays', () => ({
  useToast: () => mockToast,
}));

vi.mock('@/components/custody', () => ({
  PageFrame: ({
    title,
    policyStrip,
    actions,
    children,
  }: {
    title: React.ReactNode;
    eyebrow?: React.ReactNode;
    policyStrip?: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="page-frame">
      <h1>{title}</h1>
      <div data-testid="policy-strip">{policyStrip}</div>
      <div data-testid="actions">{actions}</div>
      {children}
    </div>
  ),
  ChainPill: ({ chain }: { chain: string }) => <span data-testid={`chain-pill-${chain}`} />,
  StatusBadge: ({ status }: { status: string }) => <span data-testid={`status-badge-${status}`} />,
}));

const mockUseAuth = vi.fn();
vi.mock('@/auth/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/constants', () => ({
  MULTISIG_POLICY: { required: 2, total: 3 },
}));

vi.mock('@/lib/format', () => ({
  fmtUSD: (n: number) => n.toFixed(2),
  shortHash: (h: string) => h.slice(0, 6),
}));

vi.mock('@/features/_shared/realtime', () => ({
  BlockTicker: ({ chain }: { chain: string }) => <span data-testid={`block-ticker-${chain}`} />,
  LiveTimeAgo: ({ at }: { at: string }) => <span data-testid="live-time-ago">{at}</span>,
}));

const mockUseColdBalances = vi.fn();
const mockUseColdWallets = vi.fn();
const mockUseRebalanceHistory = vi.fn();
const mockUseRunBandCheck = vi.fn();

vi.mock('@/api/queries', () => ({
  useColdBalances: () => mockUseColdBalances(),
  useColdWallets: () => mockUseColdWallets(),
  useRebalanceHistory: () => mockUseRebalanceHistory(),
  useRunBandCheck: () => mockUseRunBandCheck(),
}));

vi.mock('../cold-chain-section', () => ({
  ColdChainSection: ({
    chain,
    onRebalance,
  }: {
    chain: string;
    balanceEntries: unknown;
    hotMeta: unknown;
    coldMeta: unknown;
    canRebalance: boolean;
    onRebalance: (chain: string, direction: string) => void;
  }) => (
    <div data-testid={`cold-chain-section-${chain}`}>
      <button type="button" onClick={() => onRebalance(chain, 'hot→cold')}>
        rebalance-{chain}
      </button>
    </div>
  ),
}));

vi.mock('../rebalance-modal', () => ({
  RebalanceModal: ({
    open,
    onClose,
  }: {
    open: boolean;
    chain: string | null;
    direction: string;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="rebalance-modal">
        <button type="button" onClick={onClose}>
          close-rebalance
        </button>
      </div>
    ) : null,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { ColdPage } from '../cold-page';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage({
  isLoading = false,
  isError = false,
  balances = null as unknown,
  history = [] as unknown[],
} = {}) {
  mockUseAuth.mockReturnValue({ staff: { staffId: 'a1', role: 'admin' } });
  mockUseColdBalances.mockReturnValue({ data: balances, isLoading, isError });
  mockUseColdWallets.mockReturnValue({ data: [] });
  mockUseRebalanceHistory.mockReturnValue({ data: { data: history } });
  mockUseRunBandCheck.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  });
  return render(<ColdPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ColdPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders page frame', () => {
    renderPage();
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders cold title', () => {
    renderPage();
    expect(screen.getByText('cold.title')).toBeInTheDocument();
  });

  it('renders run band check button', () => {
    renderPage();
    expect(screen.getByText('cold.runBandCheck')).toBeInTheDocument();
  });

  it('shows loading text when balancesLoading', () => {
    renderPage({ isLoading: true });
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('shows error alert when balancesError', () => {
    renderPage({ isError: true });
    expect(screen.getByText('cold.balancesError')).toBeInTheDocument();
  });

  it('does not render chain sections while loading', () => {
    renderPage({ isLoading: true });
    expect(screen.queryByTestId('cold-chain-section-bnb')).not.toBeInTheDocument();
  });

  it('renders chain sections when balances available', () => {
    renderPage({ balances: [{ chain: 'bnb', tier: 'hot', usdt: 1000, usdc: 0 }] });
    expect(screen.getByTestId('cold-chain-section-bnb')).toBeInTheDocument();
    expect(screen.getByTestId('cold-chain-section-sol')).toBeInTheDocument();
  });

  it('shows empty history message when no history', () => {
    renderPage({ history: [] });
    expect(screen.getByText('cold.historyEmpty')).toBeInTheDocument();
  });

  it('shows history ops count', () => {
    const row = {
      id: 'r1',
      direction: 'hot→cold',
      chain: 'bnb',
      amount: 1000,
      sigs: 1,
      status: 'pending',
      proposer: 'abc12345',
      createdAt: new Date().toISOString(),
      executedAt: null,
      txHash: null,
    };
    renderPage({ history: [row, { ...row, id: 'r2' }] });
    expect(screen.getByText('2 ops')).toBeInTheDocument();
  });

  it('opens rebalance modal when chain section triggers onRebalance', async () => {
    const user = userEvent.setup();
    renderPage({ balances: [{ chain: 'bnb', tier: 'hot', usdt: 1000, usdc: 0 }] });
    await user.click(screen.getByText('rebalance-bnb'));
    expect(screen.getByTestId('rebalance-modal')).toBeInTheDocument();
  });

  it('closes rebalance modal on close', async () => {
    const user = userEvent.setup();
    renderPage({ balances: [{ chain: 'bnb', tier: 'hot', usdt: 1000, usdc: 0 }] });
    await user.click(screen.getByText('rebalance-bnb'));
    await user.click(screen.getByText('close-rebalance'));
    expect(screen.queryByTestId('rebalance-modal')).not.toBeInTheDocument();
  });

  it('renders block tickers', () => {
    renderPage();
    expect(screen.getByTestId('block-ticker-bnb')).toBeInTheDocument();
    expect(screen.getByTestId('block-ticker-sol')).toBeInTheDocument();
  });

  it('band check button disabled when isPending', () => {
    mockUseAuth.mockReturnValue({ staff: { staffId: 'a1', role: 'admin' } });
    mockUseColdBalances.mockReturnValue({ data: null, isLoading: false, isError: false });
    mockUseColdWallets.mockReturnValue({ data: [] });
    mockUseRebalanceHistory.mockReturnValue({ data: { data: [] } });
    mockUseRunBandCheck.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<ColdPage />);
    const btn = screen.getByRole('button', { name: '…' });
    expect(btn).toBeDisabled();
  });
});
