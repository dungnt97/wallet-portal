// Smoke tests for features/audit/audit-page.tsx — renders filters, tabs, table, and export.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
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
  Tabs: ({
    value,
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
          {tab.count !== undefined && <span data-testid={`count-${tab.value}`}>{tab.count}</span>}
        </button>
      ))}
    </div>
  ),
  Filter: ({
    label,
    value,
    active,
    onClick,
    onClear,
  }: {
    label: string;
    value?: string;
    active?: boolean;
    onClick: () => void;
    onClear?: () => void;
  }) => (
    <div data-testid={`filter-${label}`}>
      <button type="button" onClick={onClick}>
        {label}
        {value && <span>{value}</span>}
      </button>
      {active && onClear && (
        <button type="button" data-testid={`clear-${label}`} onClick={onClear}>
          x
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/features/_shared/realtime', () => ({
  LiveDot: () => <span data-testid="live-dot" />,
}));

const mockUseAuditLogs = vi.fn();
const mockUseAuditVerify = vi.fn();
vi.mock('../use-audit-logs', () => ({
  useAuditLogs: (params: unknown) => mockUseAuditLogs(params),
  useAuditVerify: (from: unknown, to: unknown) => mockUseAuditVerify(from, to),
}));

vi.mock('../audit-socket-listener', () => ({
  useAuditSocketListener: vi.fn(),
}));

vi.mock('../audit-kpi-strip', () => ({
  AuditKpiStrip: ({
    total,
    isLoading,
  }: { total: number; isLoading: boolean; loginCount: number | null }) => (
    <div data-testid="audit-kpi-strip" data-total={total} data-loading={isLoading} />
  ),
}));

vi.mock('../audit-tables', () => ({
  AuditActionsTable: ({
    rows,
    page,
    total,
  }: {
    rows: unknown[];
    page: number;
    totalPages: number;
    total: number;
    pageSize: number;
    hashValidity: Map<string, boolean>;
    onPrev: () => void;
    onNext: () => void;
    onRowClick: (row: unknown) => void;
  }) => (
    <div data-testid="audit-actions-table" data-page={page} data-total={total}>
      {rows.length} rows
    </div>
  ),
  AuditLoginsTable: ({ rows }: { rows: unknown[] }) => (
    <div data-testid="audit-logins-table">{rows.length} logins</div>
  ),
}));

vi.mock('../audit-detail-sheet', () => ({
  AuditDetailSheet: ({ row, onClose }: { row: unknown; onClose: () => void }) =>
    row ? (
      <div data-testid="audit-detail-sheet">
        <button type="button" onClick={onClose}>
          close-detail
        </button>
      </div>
    ) : null,
}));

vi.mock('@/api/queries', () => ({
  useLoginHistory: vi.fn(() => ({ data: undefined })),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { AuditPage } from '../audit-page';

// ── Tests ─────────────────────────────────────────────────────────────────────

const DEFAULT_DATA = { data: [], total: 0 };

function renderPage() {
  mockUseAuditLogs.mockReturnValue({ data: DEFAULT_DATA, isLoading: false });
  mockUseAuditVerify.mockReturnValue({ data: undefined });
  return render(<AuditPage />);
}

describe('AuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page frame', () => {
    renderPage();
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders audit title', () => {
    renderPage();
    expect(screen.getByText('audit.title')).toBeInTheDocument();
  });

  it('renders policy strip with SHA-256 chained text', () => {
    renderPage();
    expect(screen.getByText('SHA-256 chained')).toBeInTheDocument();
  });

  it('renders live dot in policy strip', () => {
    renderPage();
    expect(screen.getByTestId('live-dot')).toBeInTheDocument();
  });

  it('renders export button', () => {
    renderPage();
    expect(screen.getByText('audit.export.btn')).toBeInTheDocument();
  });

  it('renders KPI strip', () => {
    renderPage();
    expect(screen.getByTestId('audit-kpi-strip')).toBeInTheDocument();
  });

  it('renders tabs with actions and logins', () => {
    renderPage();
    expect(screen.getByText('audit.filters.tabActions')).toBeInTheDocument();
    expect(screen.getByText('audit.filters.tabLogins')).toBeInTheDocument();
  });

  it('renders audit actions table by default', () => {
    renderPage();
    expect(screen.getByTestId('audit-actions-table')).toBeInTheDocument();
  });

  it('does not render logins table by default', () => {
    renderPage();
    expect(screen.queryByTestId('audit-logins-table')).not.toBeInTheDocument();
  });

  it('renders action search input', () => {
    renderPage();
    expect(screen.getByPlaceholderText('audit.filters.actionPlaceholder')).toBeInTheDocument();
  });

  it('renders entity filter', () => {
    renderPage();
    expect(screen.getByTestId('filter-audit.filters.entity')).toBeInTheDocument();
  });

  it('renders from date filter', () => {
    renderPage();
    expect(screen.getByTestId('filter-audit.filters.from')).toBeInTheDocument();
  });

  it('renders to date filter', () => {
    renderPage();
    expect(screen.getByTestId('filter-audit.filters.to')).toBeInTheDocument();
  });

  it('switches to logins table when logins tab clicked', async () => {
    const user = userEvent.setup();
    mockUseAuditLogs.mockReturnValue({ data: DEFAULT_DATA, isLoading: false });
    mockUseAuditVerify.mockReturnValue({ data: undefined });
    render(<AuditPage />);
    await user.click(screen.getByText('audit.filters.tabLogins'));
    expect(screen.getByTestId('audit-logins-table')).toBeInTheDocument();
    expect(screen.queryByTestId('audit-actions-table')).not.toBeInTheDocument();
  });

  it('hides action filters when on logins tab', async () => {
    const user = userEvent.setup();
    mockUseAuditLogs.mockReturnValue({ data: DEFAULT_DATA, isLoading: false });
    mockUseAuditVerify.mockReturnValue({ data: undefined });
    render(<AuditPage />);
    await user.click(screen.getByText('audit.filters.tabLogins'));
    expect(screen.queryByTestId('filter-audit.filters.entity')).not.toBeInTheDocument();
  });

  it('cycles entity filter on click', async () => {
    const user = userEvent.setup();
    mockUseAuditLogs.mockReturnValue({ data: DEFAULT_DATA, isLoading: false });
    mockUseAuditVerify.mockReturnValue({ data: undefined });
    render(<AuditPage />);
    const entityBtn = screen.getByText('audit.filters.entity');
    await user.click(entityBtn);
    // After click entity becomes 'deposit' (first in ENTITY_OPTIONS)
    expect(screen.getByTestId('clear-audit.filters.entity')).toBeInTheDocument();
  });

  it('renders rows passed from useAuditLogs', () => {
    const rows = [
      {
        id: 'r1',
        createdAt: '2024-01-01T00:00:00Z',
        resourceType: 'withdrawal',
        action: 'approve',
        actorEmail: 'a@b.com',
        metadata: {},
      },
      {
        id: 'r2',
        createdAt: '2024-01-02T00:00:00Z',
        resourceType: 'deposit',
        action: 'create',
        actorEmail: 'b@c.com',
        metadata: {},
      },
    ];
    mockUseAuditLogs.mockReturnValue({ data: { data: rows, total: 2 }, isLoading: false });
    mockUseAuditVerify.mockReturnValue({ data: undefined });
    render(<AuditPage />);
    expect(screen.getByText('2 rows')).toBeInTheDocument();
  });

  it('shows loading state in KPI strip', () => {
    mockUseAuditLogs.mockReturnValue({ data: undefined, isLoading: true });
    mockUseAuditVerify.mockReturnValue({ data: undefined });
    render(<AuditPage />);
    const kpi = screen.getByTestId('audit-kpi-strip');
    expect(kpi.getAttribute('data-loading')).toBe('true');
  });

  it('passes date-picker inputs for from/to filters', () => {
    renderPage();
    expect(screen.getByLabelText('audit.filters.fromPrompt')).toBeInTheDocument();
    expect(screen.getByLabelText('audit.filters.toPrompt')).toBeInTheDocument();
  });

  it('sets from filter when hidden date input fires change event', () => {
    renderPage();
    const fromInput = screen.getByLabelText('audit.filters.fromPrompt') as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: '2024-01-15' } });
    // Filter chip should become active (active=!!from)
    expect(screen.getByTestId('clear-audit.filters.from')).toBeInTheDocument();
  });

  it('sets to filter when hidden date input fires change event', () => {
    renderPage();
    const toInput = screen.getByLabelText('audit.filters.toPrompt') as HTMLInputElement;
    fireEvent.change(toInput, { target: { value: '2024-02-20' } });
    expect(screen.getByTestId('clear-audit.filters.to')).toBeInTheDocument();
  });

  it('computes hash validity map when verifyData.verified is true', () => {
    const rows = [
      {
        id: 'r1',
        createdAt: '2024-01-01T00:00:00Z',
        resourceType: 'withdrawal',
        action: 'approve',
        actorEmail: 'a@b.com',
        metadata: {},
      },
    ];
    mockUseAuditLogs.mockReturnValue({ data: { data: rows, total: 1 }, isLoading: false });
    // verifyData.verified=true → all rows marked valid
    mockUseAuditVerify.mockReturnValue({ data: { verified: true, brokenAt: null } });
    render(<AuditPage />);
    // Page renders without crashing (hashValidity computed)
    expect(screen.getByTestId('audit-actions-table')).toBeInTheDocument();
  });

  it('computes hash validity map when verifyData.verified is false with brokenAt', () => {
    const rows = [
      {
        id: 'r1',
        createdAt: '2024-01-01T00:00:00Z',
        resourceType: 'withdrawal',
        action: 'approve',
        actorEmail: 'a@b.com',
        metadata: {},
      },
      {
        id: 'r2',
        createdAt: '2024-01-02T00:00:00Z',
        resourceType: 'deposit',
        action: 'create',
        actorEmail: 'b@c.com',
        metadata: {},
      },
    ];
    mockUseAuditLogs.mockReturnValue({ data: { data: rows, total: 2 }, isLoading: false });
    // verifyData.verified=false → brokenAt marks chain as broken
    mockUseAuditVerify.mockReturnValue({ data: { verified: false, brokenAt: 'r1' } });
    render(<AuditPage />);
    expect(screen.getByTestId('audit-actions-table')).toBeInTheDocument();
  });

  it('CSV export — triggers download on successful fetch response', async () => {
    const user = userEvent.setup();
    // Mock global fetch for the export handler
    const mockBlob = new Blob(['id,action\nr1,approve'], { type: 'text/csv' });
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      blob: vi.fn().mockResolvedValue(mockBlob),
      json: vi.fn(),
      headers: { get: vi.fn().mockReturnValue('attachment; filename="audit-export.csv"') },
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse as unknown as Response);

    // Mock URL.createObjectURL / revokeObjectURL
    const createObjectURL = vi.fn().mockReturnValue('blob:http://test/1');
    const revokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;

    mockUseAuditLogs.mockReturnValue({ data: DEFAULT_DATA, isLoading: false });
    mockUseAuditVerify.mockReturnValue({ data: undefined });
    render(<AuditPage />);

    await user.click(screen.getByText('audit.export.btn'));
    // Should have called fetch with the export URL
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/audit-logs/export.csv'),
      expect.objectContaining({ credentials: 'include' })
    );
    // Should show success toast
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining('audit.export.success'),
      'success'
    );

    fetchSpy.mockRestore();
  });

  it('CSV export — shows error toast when fetch throws', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    mockUseAuditLogs.mockReturnValue({ data: DEFAULT_DATA, isLoading: false });
    mockUseAuditVerify.mockReturnValue({ data: undefined });
    render(<AuditPage />);

    await user.click(screen.getByText('audit.export.btn'));
    await screen.findByTestId('page-frame');
    expect(mockToast).toHaveBeenCalledWith('common.error', 'error');

    fetchSpy.mockRestore();
  });

  it('CSV export — shows tooManyRows toast when status is 429', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: vi.fn().mockResolvedValue({ found: 15000 }),
      headers: { get: vi.fn().mockReturnValue(null) },
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse as unknown as Response);

    // Set total = 100 (under cap) so the per-row cap check doesn't trigger
    mockUseAuditLogs.mockReturnValue({ data: { data: [], total: 100 }, isLoading: false });
    mockUseAuditVerify.mockReturnValue({ data: undefined });
    render(<AuditPage />);

    await user.click(screen.getByText('audit.export.btn'));
    await screen.findByTestId('page-frame');
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining('audit.export.tooManyRows'),
      'error'
    );

    fetchSpy.mockRestore();
  });

  it('CSV export — shows generic error toast when server returns non-ok non-429 status', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: vi.fn(),
      headers: { get: vi.fn().mockReturnValue(null) },
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse as unknown as Response);

    mockUseAuditLogs.mockReturnValue({ data: { data: [], total: 100 }, isLoading: false });
    mockUseAuditVerify.mockReturnValue({ data: undefined });
    render(<AuditPage />);

    await user.click(screen.getByText('audit.export.btn'));
    await screen.findByTestId('page-frame');
    expect(mockToast).toHaveBeenCalledWith('common.error', 'error');

    fetchSpy.mockRestore();
  });
});
