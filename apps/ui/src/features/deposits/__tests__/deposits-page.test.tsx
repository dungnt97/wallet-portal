// Smoke tests for features/deposits/deposits-page.tsx — tabs, filters, manual credit modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      <div data-testid="actions">{actions}</div>
      <div data-testid="kpis">{kpis}</div>
      {children}
    </div>
  ),
  Tabs: ({
    onChange,
    tabs,
  }: {
    value: string;
    onChange: (v: string) => void;
    tabs: Array<{ value: string; label: string; count?: number }>;
    embedded?: boolean;
  }) => (
    <div data-testid="tabs">
      {tabs.map((tab) => (
        <button key={tab.value} type="button" onClick={() => onChange(tab.value)}>
          {tab.label}
        </button>
      ))}
    </div>
  ),
  Filter: ({
    label,
    onClick,
  }: {
    label: string;
    value?: string;
    active?: boolean;
    onClick: () => void;
    onClear?: () => void;
  }) => (
    <button type="button" data-testid={`filter-${label}`} onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('@/lib/constants', () => ({
  CHAINS: {
    bnb: { short: 'BNB' },
    sol: { short: 'SOL' },
  },
}));

vi.mock('@/features/_shared/realtime', () => ({
  LiveDot: () => <span data-testid="live-dot" />,
  LiveTimeAgo: ({ at }: { at: string }) => <span data-testid="live-time-ago">{at}</span>,
  useRealtime: () => ({ lastEvent: null, now: Date.now() }),
}));

vi.mock('@/features/_shared/csv-export-trigger', () => ({
  triggerCsvDownload: vi.fn(),
}));

const mockUseDeposits = vi.fn();
vi.mock('../use-deposits', () => ({
  useDeposits: (params: unknown) => mockUseDeposits(params),
}));

vi.mock('../socket-listener', () => ({
  useDepositSocketListener: vi.fn(),
}));

vi.mock('../deposits-kpi-strip', () => ({
  DepositsKpiStrip: ({ deposits }: { deposits: unknown[] }) => (
    <div data-testid="deposits-kpi-strip">{deposits.length} deposits</div>
  ),
}));

vi.mock('../deposits-policy-strip', () => ({
  DepositsPolicyStrip: () => <div data-testid="deposits-policy-strip" />,
}));

vi.mock('../deposits-sheet', () => ({
  DepositSheet: ({ deposit, onClose }: { deposit: unknown; onClose: () => void }) =>
    deposit ? (
      <div data-testid="deposit-sheet">
        <button type="button" onClick={onClose}>
          close-sheet
        </button>
      </div>
    ) : null,
}));

vi.mock('../deposits-table', () => ({
  DepositsTable: ({ rows, onSelect }: { rows: unknown[]; onSelect: (d: unknown) => void }) => (
    <div data-testid="deposits-table">
      {rows.length} rows
      <button type="button" onClick={() => onSelect({ id: 'd1', status: 'pending' })}>
        select-row
      </button>
    </div>
  ),
}));

vi.mock('../manual-credit-modal', () => ({
  ManualCreditModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="manual-credit-modal">
        <button type="button" onClick={onClose}>
          close-manual
        </button>
      </div>
    ) : null,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { DepositsPage } from '../deposits-page';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage(isLoading = false, data: unknown[] = []) {
  mockUseDeposits.mockReturnValue({
    data: { data, total: data.length },
    isLoading,
    refetch: vi.fn(),
  });
  return render(<DepositsPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DepositsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders page frame', () => {
    renderPage();
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders deposits title', () => {
    renderPage();
    expect(screen.getByText('deposits.title')).toBeInTheDocument();
  });

  it('renders KPI strip', () => {
    renderPage();
    expect(screen.getByTestId('deposits-kpi-strip')).toBeInTheDocument();
  });

  it('renders deposits table', () => {
    renderPage();
    expect(screen.getByTestId('deposits-table')).toBeInTheDocument();
  });

  it('renders tab buttons', () => {
    renderPage();
    expect(screen.getByText('deposits.tabAll')).toBeInTheDocument();
    expect(screen.getByText('deposits.tabPending')).toBeInTheDocument();
    expect(screen.getByText('deposits.tabCredited')).toBeInTheDocument();
    expect(screen.getByText('deposits.tabSwept')).toBeInTheDocument();
  });

  it('renders chain filter', () => {
    renderPage();
    expect(screen.getByTestId('filter-deposits.fChain')).toBeInTheDocument();
  });

  it('renders token filter', () => {
    renderPage();
    expect(screen.getByTestId('filter-deposits.fToken')).toBeInTheDocument();
  });

  it('renders live dot', () => {
    renderPage();
    // LiveDot rendered in actions area
    expect(screen.getByTestId('live-dot')).toBeInTheDocument();
  });

  it('renders manual credit button', () => {
    renderPage();
    expect(screen.getByText('deposits.manualCredit.title')).toBeInTheDocument();
  });

  it('opens manual credit modal when button clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      screen.getByText('deposits.manualCredit.title').closest('button') as HTMLElement
    );
    expect(screen.getByTestId('manual-credit-modal')).toBeInTheDocument();
  });

  it('closes manual credit modal on close', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      screen.getByText('deposits.manualCredit.title').closest('button') as HTMLElement
    );
    await user.click(screen.getByText('close-manual'));
    expect(screen.queryByTestId('manual-credit-modal')).not.toBeInTheDocument();
  });

  it('opens deposit sheet when row selected', async () => {
    const user = userEvent.setup();
    renderPage(false, [
      {
        id: 'd1',
        status: 'pending',
        chain: 'bnb',
        token: 'USDT',
        amount: '100',
        userId: 'u1',
        createdAt: new Date().toISOString(),
      },
    ]);
    await user.click(screen.getByText('select-row'));
    expect(screen.getByTestId('deposit-sheet')).toBeInTheDocument();
  });

  it('closes deposit sheet on close', async () => {
    const user = userEvent.setup();
    renderPage(false, [
      {
        id: 'd1',
        status: 'pending',
        chain: 'bnb',
        token: 'USDT',
        amount: '100',
        userId: 'u1',
        createdAt: new Date().toISOString(),
      },
    ]);
    await user.click(screen.getByText('select-row'));
    await user.click(screen.getByText('close-sheet'));
    expect(screen.queryByTestId('deposit-sheet')).not.toBeInTheDocument();
  });

  it('passes deposits data to KPI strip', () => {
    const deposits = [
      {
        id: 'd1',
        status: 'pending',
        chain: 'bnb',
        token: 'USDT',
        amount: '100',
        userId: 'u1',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'd2',
        status: 'credited',
        chain: 'sol',
        token: 'USDC',
        amount: '200',
        userId: 'u2',
        createdAt: new Date().toISOString(),
      },
    ];
    renderPage(false, deposits);
    expect(screen.getByText('2 deposits')).toBeInTheDocument();
  });

  it('calls useDeposits with default params', () => {
    renderPage();
    expect(mockUseDeposits).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });
});
