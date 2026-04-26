// Smoke tests for features/recon/recon-page.tsx — snapshot list, trigger modal.
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
  Modal: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title?: string;
    onClose?: () => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="trigger-modal" role="dialog">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
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
}));

const mockUseSnapshotList = vi.fn();
const mockUseSnapshotDetail = vi.fn();
const mockUseTriggerSnapshot = vi.fn();
vi.mock('@/features/reconciliation/use-reconciliation', () => ({
  useSnapshotList: (page: number) => mockUseSnapshotList(page),
  useSnapshotDetail: (id: string | null) => mockUseSnapshotDetail(id),
  useTriggerSnapshot: () => mockUseTriggerSnapshot(),
}));

vi.mock('@/features/reconciliation/snapshot-list', () => ({
  SnapshotList: ({
    snapshots,
    onSelect,
  }: {
    snapshots: unknown[];
    selectedId: string | null;
    onSelect: (id: string) => void;
  }) => (
    <div data-testid="snapshot-list">
      {snapshots.length} snapshots
      {snapshots.length > 0 && (
        <button type="button" onClick={() => onSelect('snap-1')}>
          select-snapshot
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/features/reconciliation/drift-drilldown', () => ({
  DriftDrilldown: ({ snapshot }: { snapshot: unknown; drifts: unknown[] }) => (
    <div data-testid="drift-drilldown">drilldown</div>
  ),
}));

vi.mock('@/features/reconciliation/drift-timeline-chart', () => ({
  DriftTimelineChart: ({ snapshots }: { snapshots: unknown[] }) => (
    <div data-testid="drift-timeline-chart">{snapshots.length} pts</div>
  ),
}));

vi.mock('../recon-policy-strip', () => ({
  ReconPolicyStrip: () => <div data-testid="recon-policy-strip" />,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { ReconPage } from '../recon-page';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fakeDetail = {
  snapshot: { id: 'snap-1', status: 'completed', driftPct: 0, createdAt: new Date().toISOString() },
  drifts: [],
};

function renderPage(snapshots: unknown[] = []) {
  mockUseSnapshotList.mockReturnValue({ data: { data: snapshots }, isLoading: false });
  // Return real detail data when an id is provided, null otherwise
  mockUseSnapshotDetail.mockImplementation((id: string | null) =>
    id ? { data: fakeDetail, isLoading: false } : { data: null, isLoading: false }
  );
  mockUseTriggerSnapshot.mockReturnValue({ mutate: vi.fn(), isPending: false });
  return render(<ReconPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReconPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders page frame', () => {
    renderPage();
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders recon title', () => {
    renderPage();
    expect(screen.getByText('recon.title')).toBeInTheDocument();
  });

  it('renders policy strip', () => {
    renderPage();
    expect(screen.getByTestId('recon-policy-strip')).toBeInTheDocument();
  });

  it('renders snapshot list', () => {
    renderPage();
    expect(screen.getByTestId('snapshot-list')).toBeInTheDocument();
  });

  it('shows 0 snapshots initially', () => {
    renderPage([]);
    expect(screen.getByText('0 snapshots')).toBeInTheDocument();
  });

  it('renders run scan button', () => {
    renderPage();
    expect(screen.getByText('Run scan now')).toBeInTheDocument();
  });

  it('opens trigger modal when run scan clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Run scan now'));
    expect(screen.getByTestId('trigger-modal')).toBeInTheDocument();
  });

  it('does not render timeline chart with no snapshots', () => {
    renderPage([]);
    expect(screen.queryByTestId('drift-timeline-chart')).not.toBeInTheDocument();
  });

  it('renders timeline chart when snapshots available', () => {
    renderPage([
      { id: 'snap-1', status: 'completed', driftPct: 0, createdAt: new Date().toISOString() },
    ]);
    expect(screen.getByTestId('drift-timeline-chart')).toBeInTheDocument();
  });

  it('shows Running when a snapshot has status running', () => {
    renderPage([
      { id: 'snap-1', status: 'running', driftPct: 0, createdAt: new Date().toISOString() },
    ]);
    expect(screen.getByText('Running…')).toBeInTheDocument();
  });

  it('disables run scan button when running', () => {
    renderPage([
      { id: 'snap-1', status: 'running', driftPct: 0, createdAt: new Date().toISOString() },
    ]);
    const btn = screen.getByText('Running…').closest('button') as HTMLButtonElement;
    expect(btn).toBeDisabled();
  });

  it('shows snapshot count in list', () => {
    renderPage([
      { id: 's1', status: 'completed', driftPct: 0, createdAt: new Date().toISOString() },
      { id: 's2', status: 'completed', driftPct: 0.5, createdAt: new Date().toISOString() },
    ]);
    expect(screen.getByText('2 snapshots')).toBeInTheDocument();
  });

  it('renders drift drilldown after selecting a snapshot', async () => {
    const user = userEvent.setup();
    renderPage([
      { id: 'snap-1', status: 'completed', driftPct: 0, createdAt: new Date().toISOString() },
    ]);
    await user.click(screen.getByText('select-snapshot'));
    expect(screen.getByTestId('drift-drilldown')).toBeInTheDocument();
  });
});
