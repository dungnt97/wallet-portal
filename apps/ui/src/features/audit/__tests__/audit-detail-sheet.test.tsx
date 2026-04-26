// Tests for features/audit/audit-detail-sheet.tsx — slide-in detail panel.
import { render, screen } from '@testing-library/react';
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

vi.mock('@/components/overlays', () => ({
  Sheet: ({
    open,
    onClose,
    title,
    subtitle,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    subtitle?: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="sheet">
        <h2>{title}</h2>
        {subtitle && <p data-testid="sheet-subtitle">{subtitle}</p>}
        <button type="button" data-testid="sheet-close" onClick={onClose}>
          close
        </button>
        {children}
      </div>
    ) : null,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { AuditDetailSheet } from '../audit-detail-sheet';
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
    prevHash: 'abc123prev',
    hash: 'def456hash',
    changes: { amount: 500, token: 'USDT' },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuditDetailSheet', () => {
  it('renders nothing when row is null', () => {
    render(<AuditDetailSheet row={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('renders sheet when row is provided', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
  });

  it('shows formatted createdAt as subtitle', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByTestId('sheet-subtitle').textContent).toBe('fmt:2024-01-01T10:00:00Z');
  });

  it('shows actor section label', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByText('audit.detail.actor')).toBeInTheDocument();
  });

  it('shows actor name', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByText('Alice Bob')).toBeInTheDocument();
  });

  it('shows actor email', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('shows actor initials in avatar', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    // 'Alice Bob' → 'AB'
    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  it('shows SYS initials when no actorName', () => {
    render(
      <AuditDetailSheet row={makeRow({ actorName: null as unknown as string })} onClose={vi.fn()} />
    );
    expect(screen.getByText('SYS')).toBeInTheDocument();
  });

  it('shows system label when no actorName', () => {
    render(
      <AuditDetailSheet
        row={makeRow({
          actorName: null as unknown as string,
          actorEmail: null as unknown as string,
        })}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('audit.detail.system')).toBeInTheDocument();
  });

  it('shows resource type', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByText('withdrawal')).toBeInTheDocument();
  });

  it('shows resource id', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByText('wid-123456789')).toBeInTheDocument();
  });

  it('shows action text', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByText('withdrawal.create')).toBeInTheDocument();
  });

  it('shows IP address when present', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
  });

  it('hides IP row when ipAddr is null', () => {
    render(
      <AuditDetailSheet row={makeRow({ ipAddr: null as unknown as string })} onClose={vi.fn()} />
    );
    expect(screen.queryByText('IP')).not.toBeInTheDocument();
  });

  it('shows payload JSON section', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByText('audit.detail.payload')).toBeInTheDocument();
  });

  it('renders JSON payload in pre tag', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    const pre = document.querySelector('pre') as HTMLPreElement;
    expect(pre.textContent).toContain('"amount": 500');
  });

  it('shows hash chain section', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByText('audit.detail.hashChain')).toBeInTheDocument();
  });

  it('shows prev hash value', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByText('abc123prev')).toBeInTheDocument();
  });

  it('shows genesis marker when prevHash is empty', () => {
    render(<AuditDetailSheet row={makeRow({ prevHash: '' })} onClose={vi.fn()} />);
    expect(screen.getByText('(genesis)')).toBeInTheDocument();
  });

  it('shows current hash', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByText('def456hash')).toBeInTheDocument();
  });

  it('shows checking badge when hashValid is undefined', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} />);
    expect(screen.getByText('hash: checking…')).toBeInTheDocument();
  });

  it('shows ok badge when hashValid=true', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} hashValid={true} />);
    expect(screen.getByText('hash ok')).toBeInTheDocument();
  });

  it('shows broken badge when hashValid=false', () => {
    render(<AuditDetailSheet row={makeRow()} onClose={vi.fn()} hashValid={false} />);
    expect(screen.getByText('hash broken')).toBeInTheDocument();
  });
});
