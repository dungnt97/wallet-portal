// Smoke tests for features/dashboard/dashboard-page.tsx — activity feed, KPI grid, panels.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
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

const mockToast = vi.fn();
vi.mock('@/components/overlays', () => ({
  useToast: () => mockToast,
}));

vi.mock('@/components/custody', () => ({
  PageFrame: ({
    title,
    policyStrip,
    actions,
    kpis,
    children,
  }: {
    title: React.ReactNode;
    eyebrow?: React.ReactNode;
    policyStrip?: React.ReactNode;
    actions?: React.ReactNode;
    kpis?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="page-frame">
      <h1>{title}</h1>
      <div data-testid="policy-strip">{policyStrip}</div>
      <div data-testid="actions">{actions}</div>
      <div data-testid="kpis">{kpis}</div>
      {children}
    </div>
  ),
  ChainPill: ({ chain }: { chain: string }) => <span data-testid={`chain-pill-${chain}`} />,
  Hash: ({ value }: { value: string }) => <span data-testid="hash">{value}</span>,
  StatusBadge: ({ status }: { status: string }) => <span data-testid={`status-${status}`} />,
}));

vi.mock('@/lib/format', () => ({
  fmtUSD: (n: number) => n.toString(),
}));

vi.mock('@/features/_shared/realtime', () => ({
  LiveDot: () => <span data-testid="live-dot" />,
  LiveTimeAgo: ({ at }: { at: string }) => <span data-testid="live-time-ago">{at}</span>,
  useRealtime: () => ({ lastEvent: null, now: Date.now() }),
}));

const mockUseTransactions = vi.fn();
vi.mock('@/api/queries', () => ({
  useTransactions: (params: unknown) => mockUseTransactions(params),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../dashboard-chart', () => ({
  DashboardChart: () => <div data-testid="dashboard-chart" />,
  HoldingsList: () => <div data-testid="holdings-list" />,
}));

vi.mock('../dashboard-kpi-grid', () => ({
  DashboardKpiGrid: ({ onNavigate }: { onNavigate: (p: string) => void }) => (
    <div data-testid="dashboard-kpi-grid">
      <button type="button" onClick={() => onNavigate('deposits')}>
        nav-deposits
      </button>
    </div>
  ),
}));

vi.mock('../dashboard-panels', () => ({
  AlertsList: () => <div data-testid="alerts-list" />,
  ComplianceList: () => <div data-testid="compliance-list" />,
  GasWalletList: () => <div data-testid="gas-wallet-list" />,
  SLAGrid: () => <div data-testid="sla-grid" />,
  SystemStatusList: () => <div data-testid="system-status-list" />,
}));

vi.mock('../dashboard-policy-strip', () => ({
  DashboardPolicyStrip: () => <div data-testid="dashboard-policy-strip" />,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { DashboardPage } from '../dashboard-page';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage(txRows: unknown[] = [], isLoading = false) {
  mockUseTransactions.mockReturnValue({
    data: { data: txRows, total: txRows.length },
    isLoading,
    refetch: vi.fn(),
  });
  return render(<DashboardPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  it('renders page frame', () => {
    renderPage();
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders dashboard title', () => {
    renderPage();
    expect(screen.getByText('dashboard.title')).toBeInTheDocument();
  });

  it('renders KPI grid', () => {
    renderPage();
    expect(screen.getByTestId('dashboard-kpi-grid')).toBeInTheDocument();
  });

  it('renders dashboard chart', () => {
    renderPage();
    expect(screen.getByTestId('dashboard-chart')).toBeInTheDocument();
  });

  it('renders holdings list', () => {
    renderPage();
    expect(screen.getByTestId('holdings-list')).toBeInTheDocument();
  });

  it('renders policy strip', () => {
    renderPage();
    expect(screen.getByTestId('dashboard-policy-strip')).toBeInTheDocument();
  });

  it('renders alerts list', () => {
    renderPage();
    expect(screen.getByTestId('alerts-list')).toBeInTheDocument();
  });

  it('renders system status list', () => {
    renderPage();
    expect(screen.getByTestId('system-status-list')).toBeInTheDocument();
  });

  it('renders gas wallet list', () => {
    renderPage();
    expect(screen.getByTestId('gas-wallet-list')).toBeInTheDocument();
  });

  it('renders SLA grid', () => {
    renderPage();
    expect(screen.getByTestId('sla-grid')).toBeInTheDocument();
  });

  it('renders compliance list', () => {
    renderPage();
    expect(screen.getByTestId('compliance-list')).toBeInTheDocument();
  });

  it('shows loading state in activity feed', () => {
    renderPage([], true);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('shows empty state when no transactions', () => {
    renderPage([], false);
    expect(screen.getByText('common.empty')).toBeInTheDocument();
  });

  it('renders activity feed header', () => {
    renderPage();
    expect(screen.getByText('dashboard.activityFeed')).toBeInTheDocument();
  });

  it('renders transactions in table when data available', () => {
    renderPage([
      {
        id: 'tx1',
        type: 'deposit',
        chain: 'bnb',
        token: 'USDT',
        amount: 100,
        txHash: '0xabc',
        status: 'confirmed',
        timestamp: new Date().toISOString(),
      },
    ]);
    expect(screen.getByText('deposit')).toBeInTheDocument();
  });
});
