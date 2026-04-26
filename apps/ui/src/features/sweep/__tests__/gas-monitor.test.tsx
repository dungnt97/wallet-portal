// Tests for features/sweep/gas-monitor.tsx — 24h gas chart + tier table.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
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
  CHAINS: {
    bnb: { name: 'BNB Chain', short: 'BSC' },
    sol: { name: 'Solana', short: 'SOL' },
  },
}));

const mockUseGasHistory = vi.fn();
vi.mock('../use-gas-history', () => ({
  useGasHistory: (chain: string) => mockUseGasHistory(chain),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { GasMonitor } from '../gas-monitor';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGasData(overrides = {}) {
  return {
    points: [
      { t: '2024-01-01T08:00:00Z', price: 5.0 },
      { t: '2024-01-01T09:00:00Z', price: 6.0 },
      { t: '2024-01-01T10:00:00Z', price: 5.5 },
    ],
    current: 5.5,
    avg: 5.5,
    min: 5.0,
    max: 6.0,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GasMonitor', () => {
  beforeEach(() => {
    mockUseGasHistory.mockReset();
  });

  it('shows unavailable state when data is null', () => {
    mockUseGasHistory.mockReturnValue({ data: null });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('Gas data unavailable')).toBeInTheDocument();
  });

  it('shows unavailable state when current is null', () => {
    mockUseGasHistory.mockReturnValue({ data: { ...makeGasData(), current: null } });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('Gas data unavailable')).toBeInTheDocument();
  });

  it('shows unavailable badge when data unavailable', () => {
    mockUseGasHistory.mockReturnValue({ data: null });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('unavailable')).toBeInTheDocument();
  });

  it('renders gas title with chain name', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData() });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText(/Gas · BNB Chain/)).toBeInTheDocument();
  });

  it('renders sol chain name', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData() });
    render(<GasMonitor chain="sol" />);
    expect(screen.getByText(/Gas · Solana/)).toBeInTheDocument();
  });

  it('shows current gas value for bnb with gwei unit', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData({ current: 5.5 }) });
    const { container } = render(<GasMonitor chain="bnb" />);
    // Current value displayed in gas-monitor-value container
    expect(container.querySelector('.gas-monitor-value')).toBeInTheDocument();
    expect(screen.getAllByText('gwei')[0]).toBeInTheDocument();
  });

  it('shows average gas label', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData() });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('sweep.gasAvg')).toBeInTheDocument();
  });

  it('shows min gas label', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData() });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('sweep.gasMin')).toBeInTheDocument();
  });

  it('shows max gas label', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData() });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('sweep.gasMax')).toBeInTheDocument();
  });

  it('shows favourable state badge when gas is low', () => {
    // current=5, min=5, max=20 → pctOfMax=(5-5)/(20-5)*100=0 → low (<30)
    mockUseGasHistory.mockReturnValue({ data: makeGasData({ current: 5, min: 5, max: 20 }) });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('sweep.gasFavourable')).toBeInTheDocument();
  });

  it('shows elevated state badge when gas is high', () => {
    // current=19, min=5, max=20 → pctOfMax=(19-5)/(20-5)*100=93 → high (>=65)
    mockUseGasHistory.mockReturnValue({ data: makeGasData({ current: 19, min: 5, max: 20 }) });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('sweep.gasElevated')).toBeInTheDocument();
  });

  it('shows normal state badge when gas is mid-range', () => {
    // current=10, min=5, max=20 → pctOfMax=33 → normal (30-65)
    mockUseGasHistory.mockReturnValue({ data: makeGasData({ current: 10, min: 5, max: 20 }) });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('sweep.gasNormal')).toBeInTheDocument();
  });

  it('shows tier disclaimer', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData() });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('Tier prices indicative (±20%)')).toBeInTheDocument();
  });

  it('shows bnb tier labels', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData() });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('sweep.tierSlow')).toBeInTheDocument();
    expect(screen.getByText('sweep.tierStandard')).toBeInTheDocument();
    expect(screen.getByText('sweep.tierFast')).toBeInTheDocument();
  });

  it('shows sol tier labels', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData() });
    render(<GasMonitor chain="sol" />);
    expect(screen.getByText('sweep.tierSlow')).toBeInTheDocument();
    expect(screen.getByText('sweep.tierStandard')).toBeInTheDocument();
    expect(screen.getByText('sweep.tierPriority')).toBeInTheDocument();
  });

  it('shows recommended badge on recommended tier', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData() });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('sweep.tierRecommended')).toBeInTheDocument();
  });

  it('renders sparkline SVG when 2+ data points exist', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData() });
    const { container } = render(<GasMonitor chain="bnb" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows spark label', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData() });
    render(<GasMonitor chain="bnb" />);
    expect(screen.getByText('sweep.gasSparkLabel')).toBeInTheDocument();
  });

  it('does not render sparkline when fewer than 2 points', () => {
    mockUseGasHistory.mockReturnValue({
      data: makeGasData({ points: [{ t: '2024-01-01T08:00:00Z', price: 5.0 }] }),
    });
    const { container } = render(<GasMonitor chain="bnb" />);
    expect(container.querySelector('.gas-spark')).not.toBeInTheDocument();
  });

  it('uses SOL/sig unit for sol chain', () => {
    mockUseGasHistory.mockReturnValue({ data: makeGasData() });
    render(<GasMonitor chain="sol" />);
    // Multiple "SOL/sig" items in tier table
    const units = screen.getAllByText('SOL/sig');
    expect(units.length).toBeGreaterThanOrEqual(1);
  });
});
