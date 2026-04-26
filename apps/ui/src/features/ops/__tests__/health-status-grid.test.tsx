import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthStatusGrid } from '../health-status-grid';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/queries', () => ({
  useOpsHealth: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const healthData = {
  db: { status: 'ok' as const },
  redis: { status: 'ok' as const },
  policyEngine: { status: 'ok' as const },
  chains: [
    { id: 'bnb', status: 'ok' as const, latestBlock: 12345678, lagBlocks: 0, error: undefined },
    { id: 'sol', status: 'ok' as const, latestBlock: 234567890, lagBlocks: 1, error: undefined },
  ],
  queues: [
    { name: 'deposit-confirm', status: 'ok' as const, depth: 0, error: undefined },
    { name: 'sweep', status: 'ok' as const, depth: 2, error: undefined },
  ],
  workers: [
    { name: 'deposit-worker', status: 'ok' as const, lastHeartbeatAgoSec: 5, error: undefined },
  ],
};

type MockReturn = { data: unknown; isLoading: boolean; isError: boolean };

function mockHealth(val: MockReturn) {
  return val as ReturnType<typeof import('@/api/queries').useOpsHealth>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HealthStatusGrid', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows spinner when loading', async () => {
    const { useOpsHealth } = await import('@/api/queries');
    vi.mocked(useOpsHealth).mockReturnValue(
      mockHealth({ data: undefined, isLoading: true, isError: false })
    );
    render(<HealthStatusGrid />);
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });

  it('shows error message when isError=true', async () => {
    const { useOpsHealth } = await import('@/api/queries');
    vi.mocked(useOpsHealth).mockReturnValue(
      mockHealth({ data: undefined, isLoading: false, isError: true })
    );
    render(<HealthStatusGrid />);
    const card = document.querySelector('.card');
    expect(card).toBeInTheDocument();
  });

  it('shows error message when data is null', async () => {
    const { useOpsHealth } = await import('@/api/queries');
    vi.mocked(useOpsHealth).mockReturnValue(
      mockHealth({ data: null, isLoading: false, isError: false })
    );
    render(<HealthStatusGrid />);
    const card = document.querySelector('.card');
    expect(card).toBeInTheDocument();
  });

  it('renders chain chips when data is present', async () => {
    const { useOpsHealth } = await import('@/api/queries');
    vi.mocked(useOpsHealth).mockReturnValue(
      mockHealth({ data: healthData, isLoading: false, isError: false })
    );
    render(<HealthStatusGrid />);
    expect(screen.getByText('BNB')).toBeInTheDocument();
    expect(screen.getByText('SOL')).toBeInTheDocument();
  });

  it('renders queue chips', async () => {
    const { useOpsHealth } = await import('@/api/queries');
    vi.mocked(useOpsHealth).mockReturnValue(
      mockHealth({ data: healthData, isLoading: false, isError: false })
    );
    render(<HealthStatusGrid />);
    expect(screen.getByText('deposit-confirm')).toBeInTheDocument();
    expect(screen.getByText('sweep')).toBeInTheDocument();
  });

  it('renders worker chips', async () => {
    const { useOpsHealth } = await import('@/api/queries');
    vi.mocked(useOpsHealth).mockReturnValue(
      mockHealth({ data: healthData, isLoading: false, isError: false })
    );
    render(<HealthStatusGrid />);
    expect(screen.getByText('deposit-worker')).toBeInTheDocument();
  });

  it('shows OK badges for healthy components', async () => {
    const { useOpsHealth } = await import('@/api/queries');
    vi.mocked(useOpsHealth).mockReturnValue(
      mockHealth({ data: healthData, isLoading: false, isError: false })
    );
    render(<HealthStatusGrid />);
    const okBadges = screen.getAllByText('OK');
    expect(okBadges.length).toBeGreaterThan(0);
  });

  it('shows ERROR badge for unhealthy component', async () => {
    const { useOpsHealth } = await import('@/api/queries');
    const badData = {
      ...healthData,
      db: { status: 'error' as const, error: 'Connection refused' },
    };
    vi.mocked(useOpsHealth).mockReturnValue(
      mockHealth({ data: badData, isLoading: false, isError: false })
    );
    render(<HealthStatusGrid />);
    expect(screen.getByText('ERROR')).toBeInTheDocument();
  });

  it('shows error detail text for failed component', async () => {
    const { useOpsHealth } = await import('@/api/queries');
    const badData = {
      ...healthData,
      redis: { status: 'error' as const, error: 'ECONNREFUSED 6379' },
    };
    vi.mocked(useOpsHealth).mockReturnValue(
      mockHealth({ data: badData, isLoading: false, isError: false })
    );
    render(<HealthStatusGrid />);
    expect(screen.getByText('ECONNREFUSED 6379')).toBeInTheDocument();
  });

  it('renders infrastructure section chips (db, redis, policyEngine)', async () => {
    const { useOpsHealth } = await import('@/api/queries');
    vi.mocked(useOpsHealth).mockReturnValue(
      mockHealth({ data: healthData, isLoading: false, isError: false })
    );
    render(<HealthStatusGrid />);
    const cards = document.querySelectorAll('.card');
    expect(cards.length).toBeGreaterThan(3);
  });
});
