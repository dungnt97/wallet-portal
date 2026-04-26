// Tests for features/signers/signers-kpi-strip.tsx — SignersKpiStrip + SignerSetHealth.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockUseSignersStats = vi.fn();
vi.mock('@/api/queries', () => ({
  useSignersStats: () => mockUseSignersStats(),
}));

vi.mock('@/components/custody', () => ({
  KpiStrip: ({
    items,
  }: {
    items: {
      key: string;
      label: React.ReactNode;
      value: React.ReactNode;
      foot?: React.ReactNode;
    }[];
  }) => (
    <div data-testid="kpi-strip">
      {items.map((item) => (
        <div key={item.key} data-testid={`kpi-${item.key}`}>
          <div data-testid={`kpi-label-${item.key}`}>{item.label}</div>
          <div data-testid={`kpi-value-${item.key}`}>{item.value}</div>
          {item.foot && <div data-testid={`kpi-foot-${item.key}`}>{item.foot}</div>}
        </div>
      ))}
    </div>
  ),
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

vi.mock('@/lib/constants', () => ({
  MULTISIG_POLICY: { required: 2, total: 3 },
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { SignerSetHealth, SignersKpiStrip } from '../signers-kpi-strip';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSignerStat(overrides = {}) {
  return {
    staffId: 'staff-1',
    name: 'Alice Smith',
    sigCount30d: 5,
    lastActiveAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    oldestKeyAgeDays: 30,
    ...overrides,
  };
}

// ── SignersKpiStrip tests ─────────────────────────────────────────────────────

describe('SignersKpiStrip', () => {
  beforeEach(() => {
    mockUseSignersStats.mockReturnValue({ data: { data: [] } });
  });

  it('renders KPI strip', () => {
    render(<SignersKpiStrip activeCount={3} pendingChanges={0} />);
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('shows active count in active kpi', () => {
    render(<SignersKpiStrip activeCount={2} pendingChanges={0} />);
    expect(screen.getByTestId('kpi-value-active').textContent).toBe('2');
  });

  it('shows threshold value from policy', () => {
    render(<SignersKpiStrip activeCount={3} pendingChanges={0} />);
    expect(screen.getByTestId('kpi-value-threshold').textContent).toBe('2/3');
  });

  it('shows pending changes count', () => {
    render(<SignersKpiStrip activeCount={3} pendingChanges={5} />);
    expect(screen.getByTestId('kpi-value-pending').textContent).toBe('5');
  });

  it('shows Full badge when activeCount equals total', () => {
    render(<SignersKpiStrip activeCount={3} pendingChanges={0} />);
    expect(screen.getByText('Full')).toBeInTheDocument();
  });

  it('shows Partial badge when activeCount below total', () => {
    render(<SignersKpiStrip activeCount={2} pendingChanges={0} />);
    expect(screen.getByText('Partial')).toBeInTheDocument();
  });

  it('shows dash for last key activity when no stats', () => {
    mockUseSignersStats.mockReturnValue({ data: null });
    render(<SignersKpiStrip activeCount={3} pendingChanges={0} />);
    expect(screen.getByTestId('kpi-value-rotation').textContent).toBe('—');
  });

  it('shows relative time for most recent signer', () => {
    const recent = new Date(Date.now() - 90 * 1000).toISOString(); // 90s ago
    mockUseSignersStats.mockReturnValue({
      data: { data: [makeSignerStat({ lastActiveAt: recent })] },
    });
    render(<SignersKpiStrip activeCount={3} pendingChanges={0} />);
    const rotationValue = screen.getByTestId('kpi-value-rotation').textContent;
    expect(rotationValue).toMatch(/m ago|s ago|h ago|d ago/);
  });

  it('shows first name in rotation sub when signer exists', () => {
    mockUseSignersStats.mockReturnValue({
      data: { data: [makeSignerStat({ name: 'Alice Smith' })] },
    });
    render(<SignersKpiStrip activeCount={3} pendingChanges={0} />);
    expect(screen.getByText(/Alice · EVM/)).toBeInTheDocument();
  });

  it('shows Active badge when most recent signer present', () => {
    mockUseSignersStats.mockReturnValue({
      data: { data: [makeSignerStat()] },
    });
    render(<SignersKpiStrip activeCount={3} pendingChanges={0} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});

// ── SignerSetHealth tests ──────────────────────────────────────────────────────

describe('SignerSetHealth', () => {
  beforeEach(() => {
    mockUseSignersStats.mockReturnValue({ data: { data: [] } });
  });

  it('renders health section', () => {
    render(<SignerSetHealth activeCount={3} />);
    expect(screen.getByText('Set health')).toBeInTheDocument();
  });

  it('shows recent sign activity section', () => {
    render(<SignerSetHealth activeCount={3} />);
    expect(screen.getByText('Recent sign activity')).toBeInTheDocument();
  });

  it('shows active signer count', () => {
    render(<SignerSetHealth activeCount={2} />);
    expect(screen.getByText(/2\/3 signers active/)).toBeInTheDocument();
  });

  it('shows threshold text', () => {
    render(<SignerSetHealth activeCount={2} />);
    expect(screen.getByText(/Threshold 2\/3/)).toBeInTheDocument();
  });

  it('shows meets policy when threshold met', () => {
    render(<SignerSetHealth activeCount={2} />);
    expect(screen.getByText(/meets policy floor/)).toBeInTheDocument();
  });

  it('shows does not meet when threshold not met', () => {
    render(<SignerSetHealth activeCount={1} />);
    expect(screen.getByText(/does not meet policy floor/)).toBeInTheDocument();
  });

  it('shows keys rotated message when all keys recent', () => {
    mockUseSignersStats.mockReturnValue({
      data: { data: [makeSignerStat({ oldestKeyAgeDays: 30 })] },
    });
    render(<SignerSetHealth activeCount={3} />);
    expect(screen.getByText('All keys rotated within 90d target')).toBeInTheDocument();
  });

  it('shows oldest key warning when key is stale', () => {
    mockUseSignersStats.mockReturnValue({
      data: { data: [makeSignerStat({ oldestKeyAgeDays: 120 })] },
    });
    render(<SignerSetHealth activeCount={3} />);
    expect(screen.getByText(/Oldest key: 120d/)).toBeInTheDocument();
  });

  it('shows loading when stats empty', () => {
    render(<SignerSetHealth activeCount={3} />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('shows signer sign count in health items', () => {
    mockUseSignersStats.mockReturnValue({
      data: { data: [makeSignerStat({ name: 'Bob Jones', sigCount30d: 8 })] },
    });
    render(<SignerSetHealth activeCount={3} />);
    expect(screen.getByText(/Bob · 8 sigs last 30d/)).toBeInTheDocument();
  });
});
