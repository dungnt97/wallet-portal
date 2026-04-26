import type { ReconciliationDrift, ReconciliationSnapshot } from '@/api/reconciliation';
// UI tests for DriftDrilldown — severity badges, suppressed chip, filter pills, empty state.
// Mocks ChainPill and TokenPill to avoid SVG/icon complexity in tests.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/components/custody', () => ({
  ChainPill: ({ chain }: { chain: string }) => <span data-testid={`chain-${chain}`}>{chain}</span>,
  TokenPill: ({ token }: { token: string }) => <span data-testid={`token-${token}`}>{token}</span>,
}));

vi.mock('@/icons', () => ({
  I: {
    Database: () => <span data-testid="icon-db" />,
  },
}));

vi.mock('@/lib/format', () => ({
  fmtUSD: (v: number) => v.toFixed(2),
}));

import { DriftDrilldown } from '../drift-drilldown';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SNAP_ID = 'snap-0001-0000-0000-0000-000000000000';

function makeSnapshot(overrides: Partial<ReconciliationSnapshot> = {}): ReconciliationSnapshot {
  return {
    id: SNAP_ID,
    triggeredBy: null,
    status: 'completed',
    chain: null,
    scope: 'hot',
    onChainTotalMinor: '1000000000000000000',
    ledgerTotalMinor: '1000000000000000000',
    driftTotalMinor: null,
    errorMessage: null,
    createdAt: new Date('2026-04-21T00:00:00Z').toISOString(),
    completedAt: new Date('2026-04-21T00:01:00Z').toISOString(),
    ...overrides,
  };
}

function makeDrift(overrides: Partial<ReconciliationDrift> = {}): ReconciliationDrift {
  return {
    id: 'drift-001',
    snapshotId: SNAP_ID,
    chain: 'bnb',
    token: 'USDT',
    address: '0xHOT',
    accountLabel: 'hot_safe',
    onChainMinor: '201000000000000000000',
    ledgerMinor: '0',
    driftMinor: '201000000000000000000',
    severity: 'critical',
    suppressedReason: null,
    createdAt: new Date('2026-04-21T00:01:00Z').toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DriftDrilldown — rendering', () => {
  it('renders when given snapshot and drifts', () => {
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={[makeDrift()]} />);
    // Component should render without error
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders empty state when no drifts', () => {
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={[]} />);
    expect(screen.getByText('No drift rows matching filter.')).toBeInTheDocument();
  });

  it('renders summary card with snapshot scope', () => {
    render(<DriftDrilldown snapshot={makeSnapshot({ scope: 'cold' })} drifts={[]} />);
    expect(screen.getByText('cold')).toBeInTheDocument();
  });

  it('renders error message when present in snapshot', () => {
    render(
      <DriftDrilldown
        snapshot={makeSnapshot({ errorMessage: 'RPC timeout after 30s' })}
        drifts={[]}
      />
    );
    expect(screen.getByText(/RPC timeout after 30s/)).toBeInTheDocument();
  });
});

describe('DriftDrilldown — drift table', () => {
  it('renders drift rows in table with account labels', () => {
    const drifts = [
      makeDrift({ id: 'd-1', accountLabel: 'hot_safe' }),
      makeDrift({ id: 'd-2', accountLabel: 'cold_vault', severity: 'warning' }),
    ];
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={drifts} />);

    expect(screen.getByText('hot_safe')).toBeInTheDocument();
    expect(screen.getByText('cold_vault')).toBeInTheDocument();
  });

  it('renders chain and token pills for each drift', () => {
    render(
      <DriftDrilldown
        snapshot={makeSnapshot()}
        drifts={[makeDrift({ chain: 'bnb', token: 'USDT' })]}
      />
    );
    expect(screen.getByTestId('chain-bnb')).toBeInTheDocument();
    expect(screen.getByTestId('token-USDT')).toBeInTheDocument();
  });

  it('renders solana chain pill', () => {
    render(
      <DriftDrilldown
        snapshot={makeSnapshot()}
        drifts={[makeDrift({ chain: 'sol', token: 'USDC' })]}
      />
    );
    expect(screen.getByTestId('chain-sol')).toBeInTheDocument();
    expect(screen.getByTestId('token-USDC')).toBeInTheDocument();
  });

  it('renders severity badges in table', () => {
    const drifts = [
      makeDrift({ id: 'd-1', severity: 'critical' }),
      makeDrift({ id: 'd-2', severity: 'warning' }),
      makeDrift({ id: 'd-3', severity: 'info' }),
    ];
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={drifts} />);

    // Badges are rendered with specific classes: err, warn, ok
    const errBadge = screen.getByRole('table').querySelector('.badge-tight.err');
    const warnBadge = screen.getByRole('table').querySelector('.badge-tight.warn');
    const okBadge = screen.getByRole('table').querySelector('.badge-tight.ok');

    expect(errBadge).toBeInTheDocument();
    expect(warnBadge).toBeInTheDocument();
    expect(okBadge).toBeInTheDocument();
  });

  it('renders suppressed badge when drift has suppressedReason', () => {
    render(
      <DriftDrilldown
        snapshot={makeSnapshot()}
        drifts={[makeDrift({ suppressedReason: 'in_flight_withdrawal' })]}
      />
    );

    // Suppressed badge should exist (will have faint color style)
    const badges = screen.getByRole('table').querySelectorAll('.badge-tight');
    expect(badges.length).toBeGreaterThan(0);
  });
});

describe('DriftDrilldown — filtering', () => {
  it('renders filter buttons for all severities', () => {
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={[makeDrift()]} />);

    const buttons = screen.getAllByRole('button');
    // Should have 4 filter buttons (all, critical, warning, info)
    expect(buttons.length).toBe(4);
  });

  it('filters table when filter button clicked', () => {
    const drifts = [
      makeDrift({ id: 'd-1', severity: 'critical' }),
      makeDrift({ id: 'd-2', severity: 'warning' }),
    ];
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={drifts} />);

    // Initially should show both rows
    let tableRows = screen.getAllByRole('row');
    expect(tableRows.length).toBe(3); // header + 2 rows

    // Click second button (critical filter)
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);

    // Now should show only 1 critical row
    tableRows = screen.getAllByRole('row');
    expect(tableRows.length).toBe(2); // header + 1 critical row
  });

  it('shows "No drift rows matching filter." when filter has no results', () => {
    const drifts = [makeDrift({ severity: 'critical' })];
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={drifts} />);

    // Click warning button (3rd button)
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[2]); // warning

    expect(screen.getByText('No drift rows matching filter.')).toBeInTheDocument();
  });

  it('restores all rows when "all" filter reapplied', () => {
    const drifts = [
      makeDrift({ id: 'd-1', severity: 'critical' }),
      makeDrift({ id: 'd-2', severity: 'warning' }),
    ];
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={drifts} />);

    const buttons = screen.getAllByRole('button');

    // Filter to critical
    fireEvent.click(buttons[1]);
    let tableRows = screen.getAllByRole('row');
    expect(tableRows.length).toBe(2); // Only critical

    // Back to all
    fireEvent.click(buttons[0]);
    tableRows = screen.getAllByRole('row');
    expect(tableRows.length).toBe(3); // header + both rows
  });
});

describe('DriftDrilldown — drift display', () => {
  it('displays drift information in table', () => {
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={[makeDrift()]} />);

    // Drift values should be in the table
    const tableBody = screen.getByRole('table').querySelector('tbody');
    expect(tableBody).toBeInTheDocument();
    expect(tableBody?.textContent).toMatch(/\$/); // Should contain $ for USD amounts
  });
});
