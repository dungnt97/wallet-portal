import type { ReconciliationDrift, ReconciliationSnapshot } from '@/api/reconciliation';
// UI tests for DriftDrilldown — severity badges, suppressed chip, filter pills, empty state.
// Mocks ChainPill and TokenPill to avoid SVG/icon complexity in tests.
import { fireEvent, render, screen } from '@testing-library/react';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns all <span class="badge-tight ..."> elements containing the given text */
function getBadges(text: string) {
  return screen.getAllByText(text).filter((el) => el.closest('.badge-tight') !== null);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DriftDrilldown — severity badges', () => {
  it('renders critical badge for critical unsuppressed drift', () => {
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={[makeDrift()]} />);
    // getAllByText because the filter pill button also has text "critical"
    const badges = getBadges('critical');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('renders warning badge for warning drift', () => {
    render(
      <DriftDrilldown
        snapshot={makeSnapshot()}
        drifts={[makeDrift({ id: 'drift-002', severity: 'warning' })]}
      />
    );
    const badges = getBadges('warning');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('renders info badge for info drift', () => {
    render(
      <DriftDrilldown
        snapshot={makeSnapshot()}
        drifts={[makeDrift({ id: 'drift-003', severity: 'info' })]}
      />
    );
    const badges = getBadges('info');
    expect(badges.length).toBeGreaterThan(0);
  });
});

describe('DriftDrilldown — suppressed chip', () => {
  it('renders "suppressed" chip instead of severity when suppressedReason is set', () => {
    render(
      <DriftDrilldown
        snapshot={makeSnapshot()}
        drifts={[makeDrift({ suppressedReason: 'in_flight_withdrawal' })]}
      />
    );
    expect(screen.getByText('suppressed')).toBeInTheDocument();
    // No severity badge should appear in the table (the filter button is a <button>, not a badge)
    expect(getBadges('critical')).toHaveLength(0);
  });

  it('shows suppressed count in summary card', () => {
    const drifts = [
      makeDrift({ id: 'd-1', suppressedReason: 'in_flight_withdrawal' }),
      makeDrift({ id: 'd-2', suppressedReason: null, severity: 'critical' }),
    ];
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={drifts} />);
    // The "Suppressed" kpi should show 1
    const suppLabel = screen.getByText('Suppressed');
    const suppValue = suppLabel.closest('.kpi-mini')?.querySelector('.kpi-mini-value');
    expect(suppValue?.textContent).toBe('1');
  });
});

describe('DriftDrilldown — summary card', () => {
  it('shows critical count in KPI strip', () => {
    const drifts = [
      makeDrift({ id: 'd-1', severity: 'critical', suppressedReason: null }),
      makeDrift({ id: 'd-2', severity: 'critical', suppressedReason: null }),
    ];
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={drifts} />);
    const critLabel = screen.getByText('Critical drifts');
    const critValue = critLabel.closest('.kpi-mini')?.querySelector('.kpi-mini-value');
    expect(critValue?.textContent).toBe('2');
  });

  it('shows snapshot scope', () => {
    render(<DriftDrilldown snapshot={makeSnapshot({ scope: 'cold' })} drifts={[]} />);
    expect(screen.getByText('cold')).toBeInTheDocument();
  });

  it('shows error message when present', () => {
    render(
      <DriftDrilldown
        snapshot={makeSnapshot({ errorMessage: 'RPC timeout after 30s' })}
        drifts={[]}
      />
    );
    expect(screen.getByText(/RPC timeout after 30s/)).toBeInTheDocument();
  });
});

describe('DriftDrilldown — severity filter pills', () => {
  it('filters to critical drifts when critical pill clicked', () => {
    const drifts = [
      makeDrift({ id: 'd-1', severity: 'critical', suppressedReason: null }),
      makeDrift({ id: 'd-2', severity: 'warning', suppressedReason: null }),
    ];
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={drifts} />);

    // Click "critical" filter pill
    fireEvent.click(screen.getByRole('button', { name: 'critical' }));

    // After filtering: only critical badge should exist in the table
    expect(getBadges('warning')).toHaveLength(0);
    expect(getBadges('critical')).toHaveLength(1);
  });

  it('shows "No drift rows matching filter." when filter yields no results', () => {
    const drifts = [makeDrift({ severity: 'critical', suppressedReason: null })];
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={drifts} />);

    // Click "warning" filter — no warning rows
    fireEvent.click(screen.getByRole('button', { name: 'warning' }));
    expect(screen.getByText('No drift rows matching filter.')).toBeInTheDocument();
  });

  it('restores all rows when "all" pill clicked', () => {
    const drifts = [
      makeDrift({ id: 'd-1', severity: 'critical', suppressedReason: null }),
      makeDrift({ id: 'd-2', severity: 'warning', suppressedReason: null }),
    ];
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={drifts} />);

    // Filter to critical then back to all
    fireEvent.click(screen.getByRole('button', { name: 'critical' }));
    fireEvent.click(screen.getByRole('button', { name: 'all' }));

    // Both badges should be visible in the table again
    expect(getBadges('critical')).toHaveLength(1);
    expect(getBadges('warning')).toHaveLength(1);
  });
});

describe('DriftDrilldown — empty state', () => {
  it('shows "No drift rows matching filter." when no drifts passed', () => {
    render(<DriftDrilldown snapshot={makeSnapshot()} drifts={[]} />);
    expect(screen.getByText('No drift rows matching filter.')).toBeInTheDocument();
  });
});

describe('DriftDrilldown — chain and token pills', () => {
  it('renders chain and token pills for each drift row', () => {
    render(
      <DriftDrilldown
        snapshot={makeSnapshot()}
        drifts={[makeDrift({ chain: 'bnb', token: 'USDT' })]}
      />
    );
    expect(screen.getByTestId('chain-bnb')).toBeInTheDocument();
    expect(screen.getByTestId('token-USDT')).toBeInTheDocument();
  });

  it('renders sol chain pill for Solana drift', () => {
    render(
      <DriftDrilldown
        snapshot={makeSnapshot()}
        drifts={[makeDrift({ chain: 'sol', token: 'USDC' })]}
      />
    );
    expect(screen.getByTestId('chain-sol')).toBeInTheDocument();
    expect(screen.getByTestId('token-USDC')).toBeInTheDocument();
  });
});
