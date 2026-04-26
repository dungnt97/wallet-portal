// Smoke tests for features/sweep/sweep-page.tsx — chain toggle, loading state, confirm modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string) => fallback ?? k,
  }),
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
  Segmented: ({
    options,
    value,
    onChange,
  }: {
    options: Array<{ value: string; label: string }>;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div data-testid="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-active={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  ),
}));

const mockUseSweepCandidates = vi.fn();
const mockUseSweepTrigger = vi.fn();
vi.mock('../use-sweep-candidates', () => ({
  useSweepCandidates: (chain: string) => mockUseSweepCandidates(chain),
}));
vi.mock('../use-sweep-trigger', () => ({
  useSweepTrigger: () => mockUseSweepTrigger(),
}));

vi.mock('@/api/queries', () => ({
  useSweepBatches: vi.fn(() => ({ data: undefined })),
}));

vi.mock('../sweep-socket-listener', () => ({
  useSweepSocketListener: vi.fn(),
}));

vi.mock('../sweep-policy-strip', () => ({
  SweepPolicyStrip: () => <div data-testid="sweep-policy-strip" />,
}));

vi.mock('../sweep-kpi-strip', () => ({
  SweepKpiStrip: () => <div data-testid="sweep-kpi-strip" />,
}));

vi.mock('../gas-monitor', () => ({
  GasMonitor: ({ chain }: { chain: string }) => <div data-testid={`gas-monitor-${chain}`} />,
}));

vi.mock('../sweep-address-table', () => ({
  SweepAddressTable: ({
    rows,
    onToggle,
    onToggleAll,
    selectAboveThreshold,
  }: {
    rows: Array<{ id: string }>;
    chain: string;
    selected: string[];
    onToggle: (id: string) => void;
    onToggleAll: (on: boolean) => void;
    selectAboveThreshold: () => void;
  }) => (
    <div data-testid="sweep-address-table">
      {rows.length} rows
      {rows.length > 0 && (
        <button type="button" onClick={() => onToggle(String(rows[0]?.id ?? ''))}>
          toggle-first
        </button>
      )}
      <button type="button" onClick={() => onToggleAll(true)}>
        toggle-all
      </button>
      <button type="button" onClick={selectAboveThreshold}>
        select-above
      </button>
    </div>
  ),
  SweepCart: ({
    selected,
    onExecute,
  }: {
    selected: unknown[];
    totalUSDT: number;
    totalUSDC: number;
    total: number;
    estFee: number;
    chain: string;
    onExecute: () => void;
  }) => (
    <div data-testid="sweep-cart">
      {selected.length} selected
      <button type="button" onClick={onExecute}>
        execute-sweep
      </button>
    </div>
  ),
}));

vi.mock('../sweep-batch-history', () => ({
  SweepBatchHistory: ({ batches }: { batches: unknown[] }) => (
    <div data-testid="sweep-batch-history">{batches.length} batches</div>
  ),
}));

vi.mock('../sweep-confirm-modal', () => ({
  SweepConfirmModal: ({
    open,
    onClose,
    onConfirm,
  }: {
    open: boolean;
    onClose: () => void;
    executing: boolean;
    chain: string;
    addressesCount: number;
    totalUSDT: number;
    totalUSDC: number;
    total: number;
    estFee: number;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="sweep-confirm-modal">
        <button type="button" onClick={onConfirm}>
          confirm-sweep
        </button>
        <button type="button" onClick={onClose}>
          cancel-sweep
        </button>
      </div>
    ) : null,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { SweepPage } from '../sweep-page';

// ── Tests ─────────────────────────────────────────────────────────────────────

function renderPage(isLoading = false) {
  mockUseSweepCandidates.mockReturnValue({
    data: { data: [] },
    isLoading,
  });
  mockUseSweepTrigger.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ created: [] }),
    isPending: false,
  });
  return render(<SweepPage />);
}

describe('SweepPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders page frame', () => {
    renderPage();
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders sweep title', () => {
    renderPage();
    expect(screen.getByText('sweep.title')).toBeInTheDocument();
  });

  it('renders chain segmented control', () => {
    renderPage();
    expect(screen.getByTestId('segmented')).toBeInTheDocument();
    expect(screen.getByText('BNB Chain')).toBeInTheDocument();
    expect(screen.getByText('Solana')).toBeInTheDocument();
  });

  it('renders KPI strip', () => {
    renderPage();
    expect(screen.getByTestId('sweep-kpi-strip')).toBeInTheDocument();
  });

  it('renders gas monitor for default bnb chain', () => {
    renderPage();
    expect(screen.getByTestId('gas-monitor-bnb')).toBeInTheDocument();
  });

  it('renders sweep address table when not loading', () => {
    renderPage(false);
    expect(screen.getByTestId('sweep-address-table')).toBeInTheDocument();
  });

  it('shows loading text when isLoading', () => {
    renderPage(true);
    expect(screen.getByText('Loading candidates…')).toBeInTheDocument();
  });

  it('does not render sweep address table while loading', () => {
    renderPage(true);
    expect(screen.queryByTestId('sweep-address-table')).not.toBeInTheDocument();
  });

  it('renders batch history', () => {
    renderPage();
    expect(screen.getByTestId('sweep-batch-history')).toBeInTheDocument();
  });

  it('switches to Solana chain on segment click', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Solana'));
    expect(screen.getByTestId('gas-monitor-sol')).toBeInTheDocument();
  });

  it('opens confirm modal when execute button clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('execute-sweep'));
    expect(screen.getByTestId('sweep-confirm-modal')).toBeInTheDocument();
  });

  it('closes confirm modal when cancel clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('execute-sweep'));
    await user.click(screen.getByText('cancel-sweep'));
    expect(screen.queryByTestId('sweep-confirm-modal')).not.toBeInTheDocument();
  });

  it('calls trigger.mutateAsync and shows toast on confirm', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ created: ['id1', 'id2'] });
    // Set trigger mock BEFORE renderPage so it's active during render
    mockUseSweepTrigger.mockReturnValue({ mutateAsync, isPending: false });
    mockUseSweepCandidates.mockReturnValue({ data: { data: [] }, isLoading: false });
    const user = userEvent.setup();
    render(<SweepPage />);
    await user.click(screen.getByText('execute-sweep'));
    await user.click(screen.getByText('confirm-sweep'));
    await screen.findByTestId('page-frame');
    expect(mutateAsync).toHaveBeenCalled();
  });

  it('toggles address selection when row toggle clicked', async () => {
    const user = userEvent.setup();
    mockUseSweepCandidates.mockReturnValue({
      data: {
        data: [
          {
            userAddressId: 'a1',
            userId: 'u1',
            chain: 'bnb',
            address: '0xABC',
            creditedUsdt: '1000',
            creditedUsdc: '0',
          },
        ],
      },
      isLoading: false,
    });
    render(<SweepPage />);
    await user.click(screen.getByText('toggle-first'));
    // Cart shows 1 selected after toggle
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('selects above threshold addresses', async () => {
    const user = userEvent.setup();
    mockUseSweepCandidates.mockReturnValue({
      data: {
        data: [
          {
            userAddressId: 'a1',
            userId: 'u1',
            chain: 'bnb',
            address: '0xABC',
            creditedUsdt: '1000',
            creditedUsdc: '0',
          },
          {
            userAddressId: 'a2',
            userId: 'u2',
            chain: 'bnb',
            address: '0xDEF',
            creditedUsdt: '100',
            creditedUsdc: '0',
          }, // below 500
        ],
      },
      isLoading: false,
    });
    render(<SweepPage />);
    await user.click(screen.getByText('select-above'));
    // Only a1 is above 500 threshold
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('shows error toast when trigger fails', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('network fail'));
    mockUseSweepTrigger.mockReturnValue({ mutateAsync, isPending: false });
    mockUseSweepCandidates.mockReturnValue({ data: { data: [] }, isLoading: false });
    const user = userEvent.setup();
    render(<SweepPage />);
    await user.click(screen.getByText('execute-sweep'));
    await user.click(screen.getByText('confirm-sweep'));
    // Wait for async rejection
    await screen.findByTestId('page-frame');
    expect(mockToast).toHaveBeenCalledWith('sweep.error.generic', 'error');
  });

  it('shows BNB policy alert text by default', () => {
    renderPage();
    expect(screen.getByText('sweep.policyAlertBnb')).toBeInTheDocument();
  });

  it('shows Solana policy alert text after switching chain', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Solana'));
    expect(screen.getByText('sweep.policyAlertSol')).toBeInTheDocument();
  });
});
