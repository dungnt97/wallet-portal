// Tests for features/recovery/stuck-tx-table.tsx — stuck withdrawals/sweeps table.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StuckTxTable } from '../stuck-tx-table';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/components/custody', () => ({
  ChainPill: ({ chain }: { chain: string }) => (
    <span data-testid={`chain-pill-${chain}`}>{chain.toUpperCase()}</span>
  ),
}));

vi.mock('@/features/_shared/helpers', () => ({
  explorerUrl: (_chain: string, hash: string) => `https://explorer.example.com/tx/${hash}`,
}));

vi.mock('@/lib/format', () => ({
  shortHash: (h: string, _a: number, _b: number) => h.slice(0, 8),
  timeAgo: (_iso: string) => '5m ago',
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx1',
    entityType: 'withdrawal' as const,
    entityId: 'w1',
    txHash: '0xabcdef1234567890',
    chain: 'bnb' as const,
    bumpCount: 1,
    broadcastAt: '2024-01-01T10:00:00Z',
    stuckSince: '2024-01-01T10:00:00Z',
    canBump: true,
    canCancel: true,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StuckTxTable', () => {
  it('shows all-clear state when items are empty', () => {
    render(<StuckTxTable items={[]} onBump={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('recovery.allClear')).toBeInTheDocument();
    expect(screen.getByText('recovery.allClearSub')).toBeInTheDocument();
  });

  it('renders needs-attention header when items exist', () => {
    render(<StuckTxTable items={[makeItem()]} onBump={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('recovery.needsAttention')).toBeInTheDocument();
  });

  it('shows item count', () => {
    render(
      <StuckTxTable
        items={[makeItem(), makeItem({ id: 'tx2', entityId: 'w2' })]}
        onBump={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('2 tx')).toBeInTheDocument();
  });

  it('renders withdrawal badge for withdrawal entityType', () => {
    render(<StuckTxTable items={[makeItem()]} onBump={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('withdrawal')).toBeInTheDocument();
  });

  it('renders sweep badge for sweep entityType', () => {
    render(
      <StuckTxTable
        items={[makeItem({ entityType: 'sweep' })]}
        onBump={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('sweep')).toBeInTheDocument();
  });

  it('renders chain pill for the item chain', () => {
    render(
      <StuckTxTable items={[makeItem({ chain: 'sol' })]} onBump={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByTestId('chain-pill-sol')).toBeInTheDocument();
  });

  it('renders shortened tx hash as a link', () => {
    render(<StuckTxTable items={[makeItem()]} onBump={vi.fn()} onCancel={vi.fn()} />);
    const link = screen.getByRole('link');
    expect(link.textContent).toBe('0xabcdef');
    expect(link).toHaveAttribute('href', 'https://explorer.example.com/tx/0xabcdef1234567890');
  });

  it('renders bump count', () => {
    render(
      <StuckTxTable items={[makeItem({ bumpCount: 3 })]} onBump={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onBump with item when bump button clicked', async () => {
    const onBump = vi.fn();
    const user = userEvent.setup();
    const item = makeItem();
    render(<StuckTxTable items={[item]} onBump={onBump} onCancel={vi.fn()} />);
    await user.click(screen.getByText('recovery.bumpBtn').closest('button') as HTMLElement);
    expect(onBump).toHaveBeenCalledWith(item);
  });

  it('calls onCancel with item when cancel button clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const item = makeItem();
    render(<StuckTxTable items={[item]} onBump={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByText('recovery.cancelBtn').closest('button') as HTMLElement);
    expect(onCancel).toHaveBeenCalledWith(item);
  });

  it('disables bump button when canBump=false', () => {
    render(
      <StuckTxTable items={[makeItem({ canBump: false })]} onBump={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('recovery.bumpBtn').closest('button')).toBeDisabled();
  });

  it('disables cancel button when canCancel=false', () => {
    render(
      <StuckTxTable items={[makeItem({ canCancel: false })]} onBump={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('recovery.cancelBtn').closest('button')).toBeDisabled();
  });

  it('renders age as time-ago string', () => {
    render(<StuckTxTable items={[makeItem()]} onBump={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });
});
