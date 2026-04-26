// Smoke tests for features/withdrawals/withdrawals-page.tsx — tabs, filters, create modal.
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

const mockUseAuth = vi.fn();
vi.mock('@/auth/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/constants', () => ({
  ROLES: {
    admin: { id: 'admin', label: 'Admin' },
    operator: { id: 'operator', label: 'Operator' },
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

vi.mock('@/features/signing', () => ({
  SigningFlowHost: () => <div data-testid="signing-flow-host" />,
  useSigningFlow: () => ({
    state: 'idle',
    start: vi.fn(),
    reset: vi.fn(),
  }),
}));

const mockUseWithdrawalActions = vi.fn();
vi.mock('../use-withdrawal-actions', () => ({
  useWithdrawalActions: (...args: unknown[]) => mockUseWithdrawalActions(...args),
}));

vi.mock('../use-withdrawals', () => ({
  useWithdrawalsSocketListener: vi.fn(),
}));

vi.mock('../withdrawals-kpi-strip', () => ({
  WithdrawalsKpiStrip: () => <div data-testid="withdrawals-kpi-strip" />,
}));

vi.mock('../withdrawals-policy-strip', () => ({
  WithdrawalsPolicyStrip: () => <div data-testid="withdrawals-policy-strip" />,
}));

vi.mock('../withdrawals-sheet', () => ({
  WithdrawalSheet: ({ withdrawal, onClose }: { withdrawal: unknown; onClose: () => void }) =>
    withdrawal ? (
      <div data-testid="withdrawal-sheet">
        <button type="button" onClick={onClose}>
          close-sheet
        </button>
      </div>
    ) : null,
}));

vi.mock('../withdrawals-table', () => ({
  WithdrawalsTable: ({ rows }: { rows: unknown[] }) => (
    <div data-testid="withdrawals-table">{rows.length} rows</div>
  ),
}));

vi.mock('../new-withdrawal-form', () => ({
  NewWithdrawalForm: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="new-withdrawal-form">
        <button type="button" onClick={onClose}>
          close-form
        </button>
      </div>
    ) : null,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { WithdrawalsPage } from '../withdrawals-page';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeActions() {
  return {
    list: [],
    selected: null,
    setSelected: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onExecute: vi.fn(),
    onSubmitDraft: vi.fn(),
    onNewSubmit: vi.fn(),
    onSigningComplete: vi.fn(),
    onSigningRejected: vi.fn(),
  };
}

function renderPage(canCreate = true) {
  mockUseAuth.mockReturnValue({
    staff: { staffId: 's1', role: 'admin' },
    hasPerm: () => canCreate,
  });
  mockUseWithdrawalActions.mockReturnValue(makeActions());
  return render(<WithdrawalsPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WithdrawalsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders page frame', () => {
    renderPage();
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders withdrawals title', () => {
    renderPage();
    expect(screen.getByText('withdrawals.title')).toBeInTheDocument();
  });

  it('renders KPI strip', () => {
    renderPage();
    expect(screen.getByTestId('withdrawals-kpi-strip')).toBeInTheDocument();
  });

  it('renders withdrawals table', () => {
    renderPage();
    expect(screen.getByTestId('withdrawals-table')).toBeInTheDocument();
  });

  it('renders signing flow host', () => {
    renderPage();
    expect(screen.getByTestId('signing-flow-host')).toBeInTheDocument();
  });

  it('renders new withdrawal button when canCreate', () => {
    renderPage(true);
    expect(screen.getByText('withdrawals.newWithdrawal')).toBeInTheDocument();
  });

  it('new withdrawal button is enabled for operator', () => {
    renderPage(true);
    const btn = screen
      .getByText('withdrawals.newWithdrawal')
      .closest('button') as HTMLButtonElement;
    expect(btn).not.toBeDisabled();
  });

  it('new withdrawal button is disabled when no permission', () => {
    renderPage(false);
    const btn = screen
      .getByText('withdrawals.newWithdrawal')
      .closest('button') as HTMLButtonElement;
    expect(btn).toBeDisabled();
  });

  it('opens new withdrawal form on button click', async () => {
    const user = userEvent.setup();
    renderPage(true);
    await user.click(
      screen.getByText('withdrawals.newWithdrawal').closest('button') as HTMLElement
    );
    expect(screen.getByTestId('new-withdrawal-form')).toBeInTheDocument();
  });

  it('closes new withdrawal form on onClose', async () => {
    const user = userEvent.setup();
    renderPage(true);
    await user.click(
      screen.getByText('withdrawals.newWithdrawal').closest('button') as HTMLElement
    );
    await user.click(screen.getByText('close-form'));
    expect(screen.queryByTestId('new-withdrawal-form')).not.toBeInTheDocument();
  });

  it('renders tab buttons', () => {
    renderPage();
    expect(screen.getByText('withdrawals.tabAll')).toBeInTheDocument();
    expect(screen.getByText('withdrawals.tabPending')).toBeInTheDocument();
  });

  it('renders chain filter', () => {
    renderPage();
    expect(screen.getByTestId('filter-withdrawals.fChain')).toBeInTheDocument();
  });

  it('renders export button', () => {
    renderPage();
    expect(screen.getByText('withdrawals.exportCsv')).toBeInTheDocument();
  });
});
