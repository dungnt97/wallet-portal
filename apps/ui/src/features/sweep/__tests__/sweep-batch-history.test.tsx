// Tests for features/sweep/sweep-batch-history.tsx — sweep batch history table.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('@/components/custody', () => ({
  ChainPill: ({ chain }: { chain: string }) => (
    <span data-testid={`chain-pill-${chain}`}>{chain}</span>
  ),
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid={`status-badge-${status}`}>{status}</span>
  ),
}));

vi.mock('@/lib/format', () => ({
  fmtUSD: (n: number) => n.toFixed(2),
}));

vi.mock('@/features/_shared/realtime', () => ({
  LiveTimeAgo: ({ at }: { at: string }) => <span data-testid="live-time-ago">{at}</span>,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import type { SweepBatchRow } from '@/api/queries';
import { SweepBatchHistory } from '../sweep-batch-history';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBatch(overrides: Partial<SweepBatchRow> = {}): SweepBatchRow {
  return {
    id: 'batch-001',
    chain: 'bnb',
    addresses: 5,
    total: 12000,
    fee: 0.0021,
    status: 'completed',
    createdAt: '2024-01-01T10:00:00Z',
    executedAt: '2024-01-01T10:05:00Z',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SweepBatchHistory', () => {
  it('renders table', () => {
    render(<SweepBatchHistory batches={[]} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows recent batches title', () => {
    render(<SweepBatchHistory batches={[]} />);
    expect(screen.getByText('sweep.recentBatches')).toBeInTheDocument();
  });

  it('shows subtitle', () => {
    render(<SweepBatchHistory batches={[]} />);
    expect(screen.getByText('sweep.recentBatchesSub')).toBeInTheDocument();
  });

  it('shows batch count', () => {
    render(<SweepBatchHistory batches={[makeBatch(), makeBatch({ id: 'batch-002' })]} />);
    expect(screen.getByText(/sweep\.batchesCount/)).toBeInTheDocument();
  });

  it('shows batch id in table', () => {
    render(<SweepBatchHistory batches={[makeBatch()]} />);
    expect(screen.getByText('batch-001')).toBeInTheDocument();
  });

  it('shows chain pill', () => {
    render(<SweepBatchHistory batches={[makeBatch()]} />);
    expect(screen.getByTestId('chain-pill-bnb')).toBeInTheDocument();
  });

  it('shows address count', () => {
    render(<SweepBatchHistory batches={[makeBatch({ addresses: 5 })]} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows formatted total amount', () => {
    render(<SweepBatchHistory batches={[makeBatch({ total: 12000 })]} />);
    expect(screen.getByText('$12000.00')).toBeInTheDocument();
  });

  it('shows BNB fee with 4 decimal places', () => {
    render(<SweepBatchHistory batches={[makeBatch({ chain: 'bnb', fee: 0.0021 })]} />);
    expect(screen.getByText('0.0021 BNB')).toBeInTheDocument();
  });

  it('shows SOL fee with 6 decimal places', () => {
    render(<SweepBatchHistory batches={[makeBatch({ chain: 'sol', fee: 0.000025 })]} />);
    expect(screen.getByText('0.000025 SOL')).toBeInTheDocument();
  });

  it('shows completed status badge', () => {
    render(<SweepBatchHistory batches={[makeBatch({ status: 'completed' })]} />);
    expect(screen.getByTestId('status-badge-completed')).toBeInTheDocument();
  });

  it('shows partial badge when status is partial', () => {
    render(<SweepBatchHistory batches={[makeBatch({ status: 'partial' })]} />);
    expect(screen.getByText('sweep.partial')).toBeInTheDocument();
  });

  it('shows createdAt via LiveTimeAgo', () => {
    render(<SweepBatchHistory batches={[makeBatch()]} />);
    const timeAgos = screen.getAllByTestId('live-time-ago');
    expect(timeAgos.some((el) => el.textContent === '2024-01-01T10:00:00Z')).toBe(true);
  });

  it('shows executedAt via LiveTimeAgo when present', () => {
    render(<SweepBatchHistory batches={[makeBatch({ executedAt: '2024-01-01T10:05:00Z' })]} />);
    const timeAgos = screen.getAllByTestId('live-time-ago');
    expect(timeAgos.some((el) => el.textContent === '2024-01-01T10:05:00Z')).toBe(true);
  });

  it('shows dash when executedAt is null', () => {
    render(<SweepBatchHistory batches={[makeBatch({ executedAt: null })]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders multiple batches', () => {
    render(
      <SweepBatchHistory
        batches={[makeBatch({ id: 'batch-001' }), makeBatch({ id: 'batch-002' })]}
      />
    );
    expect(screen.getByText('batch-001')).toBeInTheDocument();
    expect(screen.getByText('batch-002')).toBeInTheDocument();
  });

  it('shows column headers', () => {
    render(<SweepBatchHistory batches={[]} />);
    expect(screen.getByText('sweep.cBatchId')).toBeInTheDocument();
    expect(screen.getByText('common.chain')).toBeInTheDocument();
    expect(screen.getByText('common.status')).toBeInTheDocument();
  });
});
