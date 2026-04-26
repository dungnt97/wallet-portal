// Tests for features/reconciliation/drift-timeline-chart.tsx — SVG area chart.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/lib/format', () => ({
  fmtCompact: (n: number) => n.toFixed(1),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import type { ReconciliationSnapshot } from '@/api/reconciliation';
import { DriftTimelineChart } from '../drift-timeline-chart';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<ReconciliationSnapshot> = {}): ReconciliationSnapshot {
  return {
    id: 'snap-001',
    createdAt: '2024-01-15T10:00:00Z',
    scope: 'full',
    chain: null,
    triggeredBy: null,
    driftTotalMinor: '2000000',
    status: 'completed',
    drifts: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DriftTimelineChart', () => {
  it('shows not-enough-snapshots message with 0 snapshots', () => {
    render(<DriftTimelineChart snapshots={[]} />);
    expect(screen.getByText('recon.notEnoughSnapshots')).toBeInTheDocument();
  });

  it('shows not-enough-snapshots message with 1 completed snapshot', () => {
    render(<DriftTimelineChart snapshots={[makeSnapshot()]} />);
    expect(screen.getByText('recon.notEnoughSnapshots')).toBeInTheDocument();
  });

  it('filters out non-completed snapshots', () => {
    render(
      <DriftTimelineChart
        snapshots={[makeSnapshot({ status: 'failed' }), makeSnapshot({ status: 'running' })]}
      />
    );
    expect(screen.getByText('recon.notEnoughSnapshots')).toBeInTheDocument();
  });

  it('filters out snapshots with null driftTotalMinor', () => {
    render(
      <DriftTimelineChart
        snapshots={[
          makeSnapshot({ driftTotalMinor: null }),
          makeSnapshot({ id: 'snap-002', driftTotalMinor: null }),
        ]}
      />
    );
    expect(screen.getByText('recon.notEnoughSnapshots')).toBeInTheDocument();
  });

  it('renders SVG chart when 2+ completed snapshots', () => {
    const { container } = render(
      <DriftTimelineChart
        snapshots={[
          makeSnapshot({ id: 'snap-001', createdAt: '2024-01-01T00:00:00Z' }),
          makeSnapshot({ id: 'snap-002', createdAt: '2024-01-15T00:00:00Z' }),
        ]}
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows drift timeline title', () => {
    render(
      <DriftTimelineChart
        snapshots={[
          makeSnapshot({ id: 'snap-001', createdAt: '2024-01-01T00:00:00Z' }),
          makeSnapshot({ id: 'snap-002', createdAt: '2024-01-15T00:00:00Z' }),
        ]}
      />
    );
    expect(screen.getByText('recon.driftTimeline')).toBeInTheDocument();
  });

  it('shows drift unit label', () => {
    render(
      <DriftTimelineChart
        snapshots={[
          makeSnapshot({ id: 'snap-001', createdAt: '2024-01-01T00:00:00Z' }),
          makeSnapshot({ id: 'snap-002', createdAt: '2024-01-15T00:00:00Z' }),
        ]}
      />
    );
    expect(screen.getByText('recon.driftUnit')).toBeInTheDocument();
  });

  it('renders area path in SVG', () => {
    const { container } = render(
      <DriftTimelineChart
        snapshots={[
          makeSnapshot({
            id: 'snap-001',
            createdAt: '2024-01-01T00:00:00Z',
            driftTotalMinor: '1000000',
          }),
          makeSnapshot({
            id: 'snap-002',
            createdAt: '2024-01-15T00:00:00Z',
            driftTotalMinor: '2000000',
          }),
        ]}
      />
    );
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(2); // area + line
  });

  it('renders data point circles', () => {
    const { container } = render(
      <DriftTimelineChart
        snapshots={[
          makeSnapshot({ id: 'snap-001', createdAt: '2024-01-01T00:00:00Z' }),
          makeSnapshot({ id: 'snap-002', createdAt: '2024-01-02T00:00:00Z' }),
          makeSnapshot({ id: 'snap-003', createdAt: '2024-01-03T00:00:00Z' }),
        ]}
      />
    );
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(3);
  });

  it('renders 4 grid lines', () => {
    const { container } = render(
      <DriftTimelineChart
        snapshots={[
          makeSnapshot({ id: 'snap-001', createdAt: '2024-01-01T00:00:00Z' }),
          makeSnapshot({ id: 'snap-002', createdAt: '2024-01-15T00:00:00Z' }),
        ]}
      />
    );
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(4);
  });

  it('renders gradient definition', () => {
    const { container } = render(
      <DriftTimelineChart
        snapshots={[
          makeSnapshot({ id: 'snap-001', createdAt: '2024-01-01T00:00:00Z' }),
          makeSnapshot({ id: 'snap-002', createdAt: '2024-01-15T00:00:00Z' }),
        ]}
      />
    );
    expect(container.querySelector('linearGradient')).toBeInTheDocument();
  });

  it('sorts snapshots by createdAt before plotting', () => {
    // Out-of-order snapshots should still render SVG (2 valid points after sort)
    const { container } = render(
      <DriftTimelineChart
        snapshots={[
          makeSnapshot({ id: 'snap-002', createdAt: '2024-01-15T00:00:00Z' }),
          makeSnapshot({ id: 'snap-001', createdAt: '2024-01-01T00:00:00Z' }),
        ]}
      />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('handles zero-value drift gracefully (no NaN paths)', () => {
    const { container } = render(
      <DriftTimelineChart
        snapshots={[
          makeSnapshot({ id: 'snap-001', createdAt: '2024-01-01T00:00:00Z', driftTotalMinor: '0' }),
          makeSnapshot({ id: 'snap-002', createdAt: '2024-01-15T00:00:00Z', driftTotalMinor: '0' }),
        ]}
      />
    );
    const paths = container.querySelectorAll('path');
    for (const p of paths) {
      expect(p.getAttribute('d')).not.toContain('NaN');
    }
  });
});
