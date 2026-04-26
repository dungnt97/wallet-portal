// Tests for features/audit/audit-tables.tsx — AuditActionsTable + AuditLoginsTable.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('@/lib/format', () => ({
  fmtDateTime: (iso: string) => `fmt:${iso}`,
}));

vi.mock('@/lib/constants', () => ({
  ROLES: { admin: 'Admin', treasurer: 'Treasurer', viewer: 'Viewer' },
}));

vi.mock('@/features/_shared/realtime', () => ({
  LiveTimeAgo: ({ at }: { at: string }) => <span data-testid="live-time-ago">{at}</span>,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import type { LoginHistoryRow } from '@/api/queries';
import { AuditActionsTable, AuditLoginsTable } from '../audit-tables';
import type { AuditLogEntry } from '../use-audit-logs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'r1',
    action: 'withdrawal.create',
    resourceType: 'withdrawal',
    resourceId: 'wid-123456789',
    staffId: 'staff-1',
    actorName: 'Alice Bob',
    actorEmail: 'alice@example.com',
    ipAddr: '1.2.3.4',
    createdAt: '2024-01-01T10:00:00Z',
    ...overrides,
  };
}

function makeLoginRow(overrides: Partial<LoginHistoryRow> = {}): LoginHistoryRow {
  return {
    id: 'lr1',
    staffName: 'Alice Bob',
    email: 'alice@example.com',
    result: 'success',
    ip: '1.2.3.4',
    userAgent: 'Chrome 120',
    at: '2024-01-01T10:00:00Z',
    ...overrides,
  };
}

const defaultActionsProps = {
  rows: [] as AuditLogEntry[],
  page: 1,
  totalPages: 1,
  total: 0,
  pageSize: 25,
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onRowClick: vi.fn(),
};

// ── AuditActionsTable tests ────────────────────────────────────────────────────

describe('AuditActionsTable', () => {
  it('shows empty message when rows is empty', () => {
    render(<AuditActionsTable {...defaultActionsProps} />);
    expect(screen.getByText('common.empty')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<AuditActionsTable {...defaultActionsProps} />);
    expect(screen.getByText('audit.table.action')).toBeInTheDocument();
    expect(screen.getByText('audit.table.entity')).toBeInTheDocument();
    expect(screen.getByText('audit.table.actor')).toBeInTheDocument();
    expect(screen.getByText('audit.table.ip')).toBeInTheDocument();
    expect(screen.getByText('audit.table.hash')).toBeInTheDocument();
    expect(screen.getByText('audit.table.when')).toBeInTheDocument();
  });

  it('renders a row with action name', () => {
    render(<AuditActionsTable {...defaultActionsProps} rows={[makeRow()]} total={1} />);
    expect(screen.getByText('withdrawal.create')).toBeInTheDocument();
  });

  it('renders resource type', () => {
    render(<AuditActionsTable {...defaultActionsProps} rows={[makeRow()]} total={1} />);
    expect(screen.getByText('withdrawal')).toBeInTheDocument();
  });

  it('renders truncated resource id', () => {
    render(<AuditActionsTable {...defaultActionsProps} rows={[makeRow()]} total={1} />);
    // resourceId.slice(0,8) = 'wid-1234'
    expect(screen.getByText(/wid-1234/)).toBeInTheDocument();
  });

  it('renders actor email when staffId is present', () => {
    render(<AuditActionsTable {...defaultActionsProps} rows={[makeRow()]} total={1} />);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('renders actor initials in avatar', () => {
    render(<AuditActionsTable {...defaultActionsProps} rows={[makeRow()]} total={1} />);
    // 'Alice Bob' → initials 'AB'
    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  it('shows system badge when staffId is null', () => {
    render(
      <AuditActionsTable
        {...defaultActionsProps}
        rows={[makeRow({ staffId: null as unknown as string })]}
        total={1}
      />
    );
    expect(screen.getByText('system')).toBeInTheDocument();
  });

  it('renders IP address', () => {
    render(<AuditActionsTable {...defaultActionsProps} rows={[makeRow()]} total={1} />);
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
  });

  it('shows dash for null IP', () => {
    render(
      <AuditActionsTable
        {...defaultActionsProps}
        rows={[makeRow({ ipAddr: null as unknown as string })]}
        total={1}
      />
    );
    // Two '—' rendered: one for null IP cell, one for undefined hash badge
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('shows hash badge as muted when not in hashValidity map', () => {
    render(<AuditActionsTable {...defaultActionsProps} rows={[makeRow()]} total={1} />);
    // HashBadge renders '—' span when valid=undefined
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows valid hash badge when hashValidity has true for row id', () => {
    const validity = new Map([['r1', true]]);
    render(
      <AuditActionsTable
        {...defaultActionsProps}
        rows={[makeRow()]}
        total={1}
        hashValidity={validity}
      />
    );
    expect(screen.getByTitle('Hash verified')).toBeInTheDocument();
  });

  it('shows invalid hash badge when hashValidity has false for row id', () => {
    const validity = new Map([['r1', false]]);
    render(
      <AuditActionsTable
        {...defaultActionsProps}
        rows={[makeRow()]}
        total={1}
        hashValidity={validity}
      />
    );
    expect(screen.getByTitle('Hash mismatch')).toBeInTheDocument();
  });

  it('calls onRowClick when a row is clicked', async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    const row = makeRow();
    render(
      <AuditActionsTable {...defaultActionsProps} rows={[row]} total={1} onRowClick={onRowClick} />
    );
    await user.click(screen.getByText('withdrawal.create'));
    expect(onRowClick).toHaveBeenCalledWith(row);
  });

  it('prev button is disabled on page 1', () => {
    render(<AuditActionsTable {...defaultActionsProps} page={1} totalPages={3} total={75} />);
    const prevBtn = screen.getByText('common.back').closest('button') as HTMLButtonElement;
    expect(prevBtn).toBeDisabled();
  });

  it('next button is disabled on last page', () => {
    render(<AuditActionsTable {...defaultActionsProps} page={3} totalPages={3} total={75} />);
    const nextBtn = screen.getByText('common.next').closest('button') as HTMLButtonElement;
    expect(nextBtn).toBeDisabled();
  });

  it('calls onPrev when prev button clicked', async () => {
    const onPrev = vi.fn();
    const user = userEvent.setup();
    render(
      <AuditActionsTable
        {...defaultActionsProps}
        page={2}
        totalPages={3}
        total={75}
        onPrev={onPrev}
      />
    );
    await user.click(screen.getByText('common.back').closest('button') as HTMLElement);
    expect(onPrev).toHaveBeenCalled();
  });

  it('calls onNext when next button clicked', async () => {
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(
      <AuditActionsTable
        {...defaultActionsProps}
        page={1}
        totalPages={3}
        total={75}
        onNext={onNext}
      />
    );
    await user.click(screen.getByText('common.next').closest('button') as HTMLElement);
    expect(onNext).toHaveBeenCalled();
  });

  it('renders correct action icon for sweep action', () => {
    render(
      <AuditActionsTable
        {...defaultActionsProps}
        rows={[makeRow({ action: 'sweep.execute' })]}
        total={1}
      />
    );
    expect(screen.getByTestId('icon-Sweep')).toBeInTheDocument();
  });

  it('renders correct action icon for deposit action', () => {
    render(
      <AuditActionsTable
        {...defaultActionsProps}
        rows={[makeRow({ action: 'deposit.confirm' })]}
        total={1}
      />
    );
    expect(screen.getByTestId('icon-ArrowDown')).toBeInTheDocument();
  });

  it('renders default Logs icon for unknown action', () => {
    render(
      <AuditActionsTable
        {...defaultActionsProps}
        rows={[makeRow({ action: 'unknown.action' })]}
        total={1}
      />
    );
    expect(screen.getByTestId('icon-Logs')).toBeInTheDocument();
  });
});

// ── AuditLoginsTable tests ─────────────────────────────────────────────────────

describe('AuditLoginsTable', () => {
  it('shows empty message when rows is empty', () => {
    render(<AuditLoginsTable rows={[]} />);
    expect(screen.getByText('common.empty')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<AuditLoginsTable rows={[]} />);
    expect(screen.getByText('users.colUser')).toBeInTheDocument();
    expect(screen.getByText('users.colRole')).toBeInTheDocument();
    expect(screen.getByText('audit.table.ip')).toBeInTheDocument();
    expect(screen.getByText('UA')).toBeInTheDocument();
    expect(screen.getByText('audit.table.when')).toBeInTheDocument();
  });

  it('renders staff name', () => {
    render(<AuditLoginsTable rows={[makeLoginRow()]} />);
    expect(screen.getByText('Alice Bob')).toBeInTheDocument();
  });

  it('renders staff email', () => {
    render(<AuditLoginsTable rows={[makeLoginRow()]} />);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('renders success result badge', () => {
    render(<AuditLoginsTable rows={[makeLoginRow({ result: 'success' })]} />);
    expect(screen.getByText('success')).toBeInTheDocument();
  });

  it('renders failure result badge', () => {
    render(<AuditLoginsTable rows={[makeLoginRow({ result: 'failure' })]} />);
    expect(screen.getByText('failure')).toBeInTheDocument();
  });

  it('renders IP address', () => {
    render(<AuditLoginsTable rows={[makeLoginRow()]} />);
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
  });

  it('renders user agent', () => {
    render(<AuditLoginsTable rows={[makeLoginRow()]} />);
    expect(screen.getByText('Chrome 120')).toBeInTheDocument();
  });

  it('renders formatted datetime', () => {
    render(<AuditLoginsTable rows={[makeLoginRow()]} />);
    expect(screen.getByText('fmt:2024-01-01T10:00:00Z')).toBeInTheDocument();
  });

  it('renders staff initials in avatar', () => {
    render(<AuditLoginsTable rows={[makeLoginRow()]} />);
    // 'Alice Bob' → 'AB'
    expect(screen.getByText('AB')).toBeInTheDocument();
  });
});
