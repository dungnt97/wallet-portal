// Tests for features/reconciliation/snapshot-list.tsx — paginated snapshot table.
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
  fmtUSD: (n: number) => n.toFixed(2),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import type { ReconciliationSnapshot } from '@/api/reconciliation';
import { SnapshotList } from '../snapshot-list';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<ReconciliationSnapshot> = {}): ReconciliationSnapshot {
  return {
    id: 'snap-001',
    createdAt: '2024-01-15T10:00:00Z',
    scope: 'all',
    chain: null,
    triggeredBy: null,
    driftTotalMinor: '1000000',
    onChainTotalMinor: '1000000',
    ledgerTotalMinor: '1000000',
    errorMessage: null,
    completedAt: '2024-01-15T10:01:00Z',
    status: 'completed',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SnapshotList', () => {
  it('shows empty message when no snapshots', () => {
    render(<SnapshotList snapshots={[]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('recon.noSnapshots')).toBeInTheDocument();
  });

  it('renders table when snapshots provided', () => {
    render(<SnapshotList snapshots={[makeSnapshot()]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows snapshots header', () => {
    render(<SnapshotList snapshots={[makeSnapshot()]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('recon.snapshots')).toBeInTheDocument();
  });

  it('shows entries count', () => {
    render(
      <SnapshotList
        snapshots={[makeSnapshot(), makeSnapshot({ id: 'snap-002' })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText(/recon\.entries/)).toBeInTheDocument();
  });

  it('shows scope badge', () => {
    render(
      <SnapshotList
        snapshots={[makeSnapshot({ scope: 'all' })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('all')).toBeInTheDocument();
  });

  it('shows chain badge when chain is set', () => {
    render(
      <SnapshotList
        snapshots={[makeSnapshot({ chain: 'bnb' })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('bnb')).toBeInTheDocument();
  });

  it('shows manual trigger when triggeredBy is set', () => {
    render(
      <SnapshotList
        snapshots={[makeSnapshot({ triggeredBy: 'staff-1' })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('recon.triggerManual')).toBeInTheDocument();
  });

  it('shows cron trigger when triggeredBy is null', () => {
    render(
      <SnapshotList
        snapshots={[makeSnapshot({ triggeredBy: null })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('recon.triggerCron')).toBeInTheDocument();
  });

  it('shows formatted drift total', () => {
    render(
      <SnapshotList
        snapshots={[makeSnapshot({ driftTotalMinor: '2000000' })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    // 2000000 / 1e6 = 2.00 → $2.00
    expect(screen.getByText('$2.00')).toBeInTheDocument();
  });

  it('shows dash when driftTotalMinor is null', () => {
    render(
      <SnapshotList
        snapshots={[makeSnapshot({ driftTotalMinor: null })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows completed status badge', () => {
    render(
      <SnapshotList
        snapshots={[makeSnapshot({ status: 'completed' })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('recon.statusCompleted')).toBeInTheDocument();
  });

  it('shows running status badge', () => {
    render(
      <SnapshotList
        snapshots={[makeSnapshot({ status: 'running' })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('recon.statusRunning')).toBeInTheDocument();
  });

  it('shows failed status badge', () => {
    render(
      <SnapshotList
        snapshots={[makeSnapshot({ status: 'failed' })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('recon.statusFailed')).toBeInTheDocument();
  });

  it('shows cancelled status badge', () => {
    render(
      <SnapshotList
        snapshots={[makeSnapshot({ status: 'cancelled' })]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('recon.statusCancelled')).toBeInTheDocument();
  });

  it('calls onSelect when row clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SnapshotList snapshots={[makeSnapshot()]} selectedId={null} onSelect={onSelect} />);
    await user.click(screen.getByText('all'));
    expect(onSelect).toHaveBeenCalledWith('snap-001');
  });

  it('applies row-selected class to selected row', () => {
    render(<SnapshotList snapshots={[makeSnapshot()]} selectedId="snap-001" onSelect={vi.fn()} />);
    const row = screen.getByText('all').closest('tr') as HTMLTableRowElement;
    expect(row.className).toContain('row-selected');
  });

  it('shows column headers', () => {
    render(<SnapshotList snapshots={[makeSnapshot()]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('recon.colStarted')).toBeInTheDocument();
    expect(screen.getByText('recon.colScope')).toBeInTheDocument();
    expect(screen.getByText('common.status')).toBeInTheDocument();
  });
});
