// Smoke tests for features/multisig/multisig-page.tsx — ops table, tabs, vault cards.
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
}));

const mockUseAuth = vi.fn();
vi.mock('@/auth/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/constants', () => ({
  MULTISIG_POLICY: { required: 2, total: 3 },
}));

vi.mock('@/features/_shared/realtime', () => ({
  BlockTicker: ({ chain }: { chain: string }) => <span data-testid={`block-ticker-${chain}`} />,
  LiveDot: () => <span data-testid="live-dot" />,
  LiveTimeAgo: ({ at }: { at: string }) => <span data-testid="live-time-ago">{at}</span>,
}));

vi.mock('@/features/withdrawals/use-withdrawals', () => ({
  useWithdrawalsSocketListener: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const mockUseMultisigOps = vi.fn();
const mockUseMultisigSyncStatus = vi.fn();
const mockUseRefreshMultisigSync = vi.fn();
const mockUseApproveMultisigOp = vi.fn();
const mockUseRejectMultisigOp = vi.fn();
const mockUseExecuteMultisigOp = vi.fn();
const mockUseColdBalances = vi.fn();
const mockUseWallets = vi.fn();
const mockUseStaffList = vi.fn();

vi.mock('@/api/queries', () => ({
  useMultisigOps: (params: unknown) => mockUseMultisigOps(params),
  useMultisigSyncStatus: () => mockUseMultisigSyncStatus(),
  useRefreshMultisigSync: () => mockUseRefreshMultisigSync(),
  useApproveMultisigOp: () => mockUseApproveMultisigOp(),
  useRejectMultisigOp: () => mockUseRejectMultisigOp(),
  useExecuteMultisigOp: () => mockUseExecuteMultisigOp(),
  useColdBalances: () => mockUseColdBalances(),
  useWallets: () => mockUseWallets(),
  useStaffList: (params: unknown) => mockUseStaffList(params),
}));

vi.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {},
}));

vi.mock('../multisig-kpi-strip', () => ({
  MultisigKpiStrip: () => <div data-testid="multisig-kpi-strip" />,
}));

vi.mock('../multisig-ops-table', () => ({
  MultisigOpsTable: ({
    list,
    tab,
    onTabChange,
    onSelect,
  }: {
    list: unknown[];
    tab: string;
    pendingCount: number;
    failedCount: number;
    onTabChange: (t: string) => void;
    onSelect: (op: unknown) => void;
  }) => (
    <div data-testid="multisig-ops-table">
      {(list ?? []).length} ops (tab: {tab})
      <button type="button" onClick={() => onTabChange('failed')}>
        switch-to-failed
      </button>
      <button type="button" onClick={() => onSelect({ id: 'op1', chain: 'bnb' })}>
        select-op
      </button>
    </div>
  ),
}));

vi.mock('../multisig-sheet', () => ({
  MultisigSheet: ({
    op,
    onClose,
    onApprove,
    onReject,
    onExecute,
  }: {
    op: unknown;
    onClose: () => void;
    onApprove: (o: unknown) => void;
    onReject: (o: unknown) => void;
    onExecute: (o: unknown) => void;
  }) =>
    op ? (
      <div data-testid="multisig-sheet">
        <button type="button" onClick={onClose}>
          close-sheet
        </button>
        <button type="button" onClick={() => onApprove(op)}>
          approve-op
        </button>
        <button type="button" onClick={() => onReject(op)}>
          reject-op
        </button>
        <button type="button" onClick={() => onExecute(op)}>
          execute-op
        </button>
      </div>
    ) : null,
}));

vi.mock('../vault-card', () => ({
  VaultCard: ({
    name,
    chain,
  }: {
    name: string;
    chain: string;
    address: string;
    threshold: number;
    total: number;
    balance?: unknown;
    walletMeta?: unknown;
    syncStatus?: unknown;
  }) => <div data-testid={`vault-card-${chain}`}>{name}</div>,
  TreasurerTeamCard: ({
    treasurers,
  }: { treasurers: unknown[]; required: number; total: number }) => (
    <div data-testid="treasurer-team-card">{(treasurers ?? []).length} treasurers</div>
  ),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { MultisigPage } from '../multisig-page';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage(ops: unknown[] = []) {
  mockUseAuth.mockReturnValue({ staff: { staffId: 'a1', role: 'admin' } });
  mockUseMultisigOps.mockReturnValue({ data: { data: ops } });
  mockUseMultisigSyncStatus.mockReturnValue({ data: null });
  mockUseRefreshMultisigSync.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  });
  mockUseApproveMultisigOp.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
  });
  mockUseRejectMultisigOp.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
  });
  mockUseExecuteMultisigOp.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
  });
  mockUseColdBalances.mockReturnValue({ data: [] });
  mockUseWallets.mockReturnValue({ data: { data: [] } });
  mockUseStaffList.mockReturnValue({ data: { data: [] } });
  return render(<MultisigPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MultisigPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders page frame', () => {
    renderPage();
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders multisig title', () => {
    renderPage();
    expect(screen.getByText('multisig.title')).toBeInTheDocument();
  });

  it('renders KPI strip', () => {
    renderPage();
    expect(screen.getByTestId('multisig-kpi-strip')).toBeInTheDocument();
  });

  it('renders ops table', () => {
    renderPage();
    expect(screen.getByTestId('multisig-ops-table')).toBeInTheDocument();
  });

  it('renders bnb vault card', () => {
    renderPage();
    expect(screen.getByTestId('vault-card-bnb')).toBeInTheDocument();
  });

  it('renders sol vault card', () => {
    renderPage();
    expect(screen.getByTestId('vault-card-sol')).toBeInTheDocument();
  });

  it('renders treasurer team card', () => {
    renderPage();
    expect(screen.getByTestId('treasurer-team-card')).toBeInTheDocument();
  });

  it('renders block tickers', () => {
    renderPage();
    expect(screen.getByTestId('block-ticker-bnb')).toBeInTheDocument();
    expect(screen.getByTestId('block-ticker-sol')).toBeInTheDocument();
  });

  it('shows 0 ops initially', () => {
    renderPage([]);
    expect(screen.getByText(/0 ops \(tab: pending\)/)).toBeInTheDocument();
  });

  it('opens multisig sheet when op selected', async () => {
    const user = userEvent.setup();
    renderPage([{ id: 'op1', chain: 'bnb', status: 'pending', signers: [] }]);
    await user.click(screen.getByText('select-op'));
    expect(screen.getByTestId('multisig-sheet')).toBeInTheDocument();
  });

  it('closes multisig sheet on close', async () => {
    const user = userEvent.setup();
    renderPage([{ id: 'op1', chain: 'bnb', status: 'pending', signers: [] }]);
    await user.click(screen.getByText('select-op'));
    await user.click(screen.getByText('close-sheet'));
    expect(screen.queryByTestId('multisig-sheet')).not.toBeInTheDocument();
  });

  it('switches tab when tab change triggered', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('switch-to-failed'));
    expect(screen.getByText(/0 ops \(tab: failed\)/)).toBeInTheDocument();
  });

  it('calls approve mutation when approve-op clicked in sheet', async () => {
    const mutate = vi.fn();
    mockUseApproveMultisigOp.mockReturnValue({ mutate, mutateAsync: vi.fn() });
    mockUseRejectMultisigOp.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() });
    mockUseExecuteMultisigOp.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() });
    mockUseRefreshMultisigSync.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseAuth.mockReturnValue({ staff: { staffId: 'a1', id: 'a1', role: 'admin' } });
    mockUseMultisigOps.mockReturnValue({
      data: { data: [{ id: 'op1', chain: 'bnb', status: 'pending', signers: [] }] },
    });
    mockUseMultisigSyncStatus.mockReturnValue({ data: null });
    mockUseColdBalances.mockReturnValue({ data: [] });
    mockUseWallets.mockReturnValue({ data: { data: [] } });
    mockUseStaffList.mockReturnValue({ data: { data: [] } });
    const user = userEvent.setup();
    render(<MultisigPage />);
    await user.click(screen.getByText('select-op'));
    await user.click(screen.getByText('approve-op'));
    expect(mutate).toHaveBeenCalled();
  });

  it('calls reject mutation when reject-op clicked in sheet', async () => {
    const rejectMutate = vi.fn();
    mockUseApproveMultisigOp.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() });
    mockUseRejectMultisigOp.mockReturnValue({ mutate: rejectMutate, mutateAsync: vi.fn() });
    mockUseExecuteMultisigOp.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() });
    mockUseRefreshMultisigSync.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseAuth.mockReturnValue({ staff: { staffId: 'a1', id: 'a1', role: 'admin' } });
    mockUseMultisigOps.mockReturnValue({
      data: { data: [{ id: 'op1', chain: 'bnb', status: 'pending', signers: [] }] },
    });
    mockUseMultisigSyncStatus.mockReturnValue({ data: null });
    mockUseColdBalances.mockReturnValue({ data: [] });
    mockUseWallets.mockReturnValue({ data: { data: [] } });
    mockUseStaffList.mockReturnValue({ data: { data: [] } });
    const user = userEvent.setup();
    render(<MultisigPage />);
    await user.click(screen.getByText('select-op'));
    await user.click(screen.getByText('reject-op'));
    expect(rejectMutate).toHaveBeenCalled();
  });

  it('renders sync status dots when syncStatus provided', () => {
    mockUseAuth.mockReturnValue({ staff: { staffId: 'a1', role: 'admin' } });
    mockUseMultisigOps.mockReturnValue({ data: { data: [] } });
    mockUseMultisigSyncStatus.mockReturnValue({
      data: {
        bnb: { status: 'synced', lastSyncAt: '2024-01-01T00:00:00Z' },
        sol: { status: 'synced', lastSyncAt: '2024-01-01T00:01:00Z' },
      },
    });
    mockUseRefreshMultisigSync.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseApproveMultisigOp.mockReturnValue({ mutate: vi.fn() });
    mockUseRejectMultisigOp.mockReturnValue({ mutate: vi.fn() });
    mockUseExecuteMultisigOp.mockReturnValue({ mutate: vi.fn() });
    mockUseColdBalances.mockReturnValue({ data: [] });
    mockUseWallets.mockReturnValue({ data: { data: [] } });
    mockUseStaffList.mockReturnValue({ data: { data: [] } });
    render(<MultisigPage />);
    // LiveDot renders in actions area (syncStatus provided → LiveTimeAgo also renders)
    expect(screen.getAllByTestId('live-dot').length).toBeGreaterThan(0);
    expect(screen.getByTestId('live-time-ago')).toBeInTheDocument();
  });
});
