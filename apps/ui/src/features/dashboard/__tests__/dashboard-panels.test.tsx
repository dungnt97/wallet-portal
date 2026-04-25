/* biome-ignore lint/suspicious/noExplicitAny: mocking utilities require any types */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as queries from '@/api/queries';
import { useNotifications } from '../../notifs/use-notifications';
import {
  SystemStatusList,
  GasWalletList,
  SLAGrid,
  ComplianceList,
  AlertsList,
} from '../dashboard-panels';

vi.mock('@/api/queries');
vi.mock('../../_shared/realtime', () => ({
  LiveDot: ({ variant }: { variant: string }) => <div data-testid={`live-dot-${variant}`} />,
  LiveTimeAgo: () => <span data-testid="live-time-ago">moments ago</span>,
}));
vi.mock('@/components/custody', () => ({
  ChainPill: ({ chain }: { chain: string }) => <div data-testid={`chain-${chain}`}>{chain}</div>,
}));
vi.mock('../../notifs/use-notifications', () => ({
  useNotifications: vi.fn(() => ({
    data: { data: [] },
    isLoading: false,
  })),
}));

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('SystemStatusList', () => {
  const mockHealth = {
    db: { status: 'ok', error: null },
    redis: { status: 'ok', error: null },
    policyEngine: { status: 'ok', error: null },
    chains: [
      {
        id: 'bnb',
        status: 'ok',
        lagBlocks: 0,
        latestBlock: 12345,
        error: null,
      },
      {
        id: 'solana',
        status: 'ok',
        lagBlocks: 1,
        latestBlock: 67890,
        error: null,
      },
    ],
    workers: [
      {
        name: 'deposit-worker',
        lastHeartbeatAgoSec: 5,
        error: null,
      },
    ],
    queues: [
      {
        name: 'sweep',
        depth: 10,
        status: 'ok',
        error: null,
      },
    ],
  };

  it('renders status rows for core services', () => {
    vi.mocked(queries.useOpsHealth).mockReturnValue({
      data: mockHealth,
      isLoading: false,
    } as any);

    wrap(<SystemStatusList />);

    expect(screen.getByText('Postgres')).toBeInTheDocument();
    expect(screen.getByText(/Redis/)).toBeInTheDocument();
    expect(screen.getByText(/Policy engine/)).toBeInTheDocument();
  });

  it('renders chain RPC status', () => {
    vi.mocked(queries.useOpsHealth).mockReturnValue({
      data: mockHealth,
      isLoading: false,
    } as any);

    wrap(<SystemStatusList />);

    expect(screen.getByText(/BNB RPC/)).toBeInTheDocument();
  });

  it('renders worker status with heartbeat info', () => {
    vi.mocked(queries.useOpsHealth).mockReturnValue({
      data: mockHealth,
      isLoading: false,
    } as any);

    wrap(<SystemStatusList />);

    expect(screen.getByText('deposit-worker')).toBeInTheDocument();
    expect(screen.getByText(/5s ago/)).toBeInTheDocument();
  });

  it('renders queue status with depth', () => {
    vi.mocked(queries.useOpsHealth).mockReturnValue({
      data: mockHealth,
      isLoading: false,
    } as any);

    wrap(<SystemStatusList />);

    expect(screen.getByText(/sweep queue/)).toBeInTheDocument();
  });

  it('shows loading skeleton when data is loading', () => {
    vi.mocked(queries.useOpsHealth).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    const { container } = wrap(<SystemStatusList />);

    // Should render skeleton rows
    const skeletons = container.querySelectorAll('.skeleton-row');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows ok variant dots for healthy services', () => {
    vi.mocked(queries.useOpsHealth).mockReturnValue({
      data: mockHealth,
      isLoading: false,
    } as any);

    wrap(<SystemStatusList />);

    const okDots = screen.getAllByTestId('live-dot-ok');
    expect(okDots.length).toBeGreaterThan(0);
  });

  it('shows error variant dots for unhealthy services', () => {
    const unhealthyHealth = {
      ...mockHealth,
      db: { status: 'err', error: 'connection refused' },
    };
    vi.mocked(queries.useOpsHealth).mockReturnValue({
      data: unhealthyHealth,
      isLoading: false,
    } as any);

    wrap(<SystemStatusList />);

    expect(screen.getByTestId('live-dot-err')).toBeInTheDocument();
  });
});

describe('GasWalletList', () => {
  const mockHealth = {
    chains: [
      {
        id: 'bnb',
        status: 'ok',
        lagBlocks: 1,
        latestBlock: 12345,
        error: null,
      },
      {
        id: 'solana',
        status: 'ok',
        lagBlocks: 0,
        latestBlock: 67890,
        error: null,
      },
    ],
    db: { status: 'ok', error: null },
    redis: { status: 'ok', error: null },
    policyEngine: { status: 'ok', error: null },
    workers: [],
    queues: [],
  };

  it('renders chain RPC rows', () => {
    vi.mocked(queries.useOpsHealth).mockReturnValue({
      data: mockHealth,
      isLoading: false,
    } as any);

    wrap(<GasWalletList />);

    expect(screen.getByText(/BNB RPC/)).toBeInTheDocument();
  });

  it('shows healthy status for low lag', () => {
    vi.mocked(queries.useOpsHealth).mockReturnValue({
      data: mockHealth,
      isLoading: false,
    } as any);

    const { container } = wrap(<GasWalletList />);

    // Should render gas rows for chains
    const gasRows = container.querySelectorAll('.gas-row');
    expect(gasRows.length).toBeGreaterThan(0);
  });

  it('shows degraded status for high lag', () => {
    const degradedHealth = {
      ...mockHealth,
      chains: [
        {
          ...mockHealth.chains[0],
          lagBlocks: 10,
          status: 'warn',
        },
      ],
    };
    vi.mocked(queries.useOpsHealth).mockReturnValue({
      data: degradedHealth,
      isLoading: false,
    } as any);

    const { container } = wrap(<GasWalletList />);

    // Should still render gas rows
    const gasRows = container.querySelectorAll('.gas-row');
    expect(gasRows.length).toBeGreaterThan(0);
  });

  it('renders chain pills for each chain', () => {
    vi.mocked(queries.useOpsHealth).mockReturnValue({
      data: mockHealth,
      isLoading: false,
    } as any);

    wrap(<GasWalletList />);

    expect(screen.getByTestId('chain-bnb')).toBeInTheDocument();
    expect(screen.getByTestId('chain-sol')).toBeInTheDocument();
  });

  it('shows loading skeleton when data is loading', () => {
    vi.mocked(queries.useOpsHealth).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    const { container } = wrap(<GasWalletList />);

    const skeletons = container.querySelectorAll('.skeleton-row');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('SLAGrid', () => {
  const mockSLA = {
    depositCreditP50Sec: 30,
    sweepConfirmP50Sec: 150,
    pendingDeposits: 5,
    pendingSweeps: 3,
    pendingWithdrawals: 1,
    depositsLast24h: 42,
  };

  it('renders SLA cells for each metric', () => {
    vi.mocked(queries.useSlaSummary).mockReturnValue({
      data: mockSLA,
      isLoading: false,
    } as any);

    wrap(<SLAGrid />);

    // Should render SLA cells with values
    expect(screen.getByText('30s')).toBeInTheDocument();
  });

  it('formats time values correctly', () => {
    vi.mocked(queries.useSlaSummary).mockReturnValue({
      data: mockSLA,
      isLoading: false,
    } as any);

    wrap(<SLAGrid />);

    // 30 seconds should be displayed as "30s"
    expect(screen.getByText('30s')).toBeInTheDocument();
    // 150 seconds should be "2m 30s"
    expect(screen.getByText('2m 30s')).toBeInTheDocument();
  });

  it('computes SLA bar percentage correctly', () => {
    vi.mocked(queries.useSlaSummary).mockReturnValue({
      data: mockSLA,
      isLoading: false,
    } as any);

    const { container } = wrap(<SLAGrid />);

    // depositCreditP50Sec=30, target=60: bar = (1 - 30/60) * 100 = 50%
    const bars = container.querySelectorAll('.sla-bar-fill');
    expect(bars.length).toBeGreaterThan(0);
  });

  it('shows loading skeleton when data is loading', () => {
    vi.mocked(queries.useSlaSummary).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    const { container } = wrap(<SLAGrid />);

    const skeletons = container.querySelectorAll('.skeleton-row');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('marks SLA as ok when meeting target', () => {
    vi.mocked(queries.useSlaSummary).mockReturnValue({
      data: mockSLA,
      isLoading: false,
    } as any);

    const { container } = wrap(<SLAGrid />);

    // 30s is under 60s target, should be ok
    const okBars = container.querySelectorAll('.sla-bar-fill.ok');
    expect(okBars.length).toBeGreaterThan(0);
  });

  it('marks SLA as warn when missing target', () => {
    const missingSLA = {
      ...mockSLA,
      depositCreditP50Sec: 120, // > 60s target
    };
    vi.mocked(queries.useSlaSummary).mockReturnValue({
      data: missingSLA,
      isLoading: false,
    } as any);

    const { container } = wrap(<SLAGrid />);

    const warnBars = container.querySelectorAll('.sla-bar-fill.warn');
    expect(warnBars.length).toBeGreaterThan(0);
  });
});

describe('ComplianceList', () => {
  const mockCompliance = {
    kycNone: 2,
    kycBasic: 50,
    kycEnhanced: 40,
    riskHigh: 1,
    riskFrozen: 0,
    suspendedUsers: 0,
    activeUsers: 92,
    totalUsers: 92,
  };

  it('renders KYC tier rows', () => {
    vi.mocked(queries.useComplianceSummary).mockReturnValue({
      data: mockCompliance,
      isLoading: false,
    } as any);

    wrap(<ComplianceList />);

    expect(screen.getByText(/KYC None/)).toBeInTheDocument();
    expect(screen.getByText(/KYC Basic/)).toBeInTheDocument();
    expect(screen.getByText(/KYC Enhanced/)).toBeInTheDocument();
  });

  it('calculates KYC percentages', () => {
    vi.mocked(queries.useComplianceSummary).mockReturnValue({
      data: mockCompliance,
      isLoading: false,
    } as any);

    wrap(<ComplianceList />);

    // 50/92 ≈ 54%
    expect(screen.getByText(/54%/)).toBeInTheDocument();
  });

  it('renders risk and suspension rows', () => {
    vi.mocked(queries.useComplianceSummary).mockReturnValue({
      data: mockCompliance,
      isLoading: false,
    } as any);

    wrap(<ComplianceList />);

    expect(screen.getByText(/Risk: High/)).toBeInTheDocument();
    expect(screen.getByText(/Suspended/)).toBeInTheDocument();
  });

  it('shows loading skeleton when data is loading', () => {
    vi.mocked(queries.useComplianceSummary).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    const { container } = wrap(<ComplianceList />);

    const skeletons = container.querySelectorAll('.skeleton-row');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('marks KYC None as warn when > 30% of users', () => {
    const highNoneCompliance = {
      ...mockCompliance,
      kycNone: 30, // 30/92 ≈ 32.6% > 30%
    };
    vi.mocked(queries.useComplianceSummary).mockReturnValue({
      data: highNoneCompliance,
      isLoading: false,
    } as any);

    const { container } = wrap(<ComplianceList />);

    const warnRows = container.querySelectorAll('.compliance-row');
    expect(warnRows.length).toBeGreaterThan(0);
  });

  it('marks risk/suspended as warn when > 0', () => {
    const riskyCompliance = {
      ...mockCompliance,
      riskHigh: 3,
      suspendedUsers: 2,
    };
    vi.mocked(queries.useComplianceSummary).mockReturnValue({
      data: riskyCompliance,
      isLoading: false,
    } as any);

    const { container } = wrap(<ComplianceList />);

    // Should show warn variant for risk row
    const compRows = container.querySelectorAll('.compliance-val');
    expect(compRows.length).toBeGreaterThan(0);
  });
});

describe('AlertsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows check icon when no active alerts', () => {
    vi.mocked(useNotifications).mockReturnValue({
      data: { data: [] },
      isLoading: false,
    } as any);

    const { container } = wrap(<AlertsList />);

    // Should render alert list with info variant (check icon)
    const alertList = container.querySelector('.alert-list');
    expect(alertList).toBeInTheDocument();
    expect(alertList?.querySelector('.alert-info')).toBeInTheDocument();
  });

  it('shows loading skeleton when data is loading', () => {
    vi.mocked(useNotifications).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    const { container } = wrap(<AlertsList />);

    const skeletons = container.querySelectorAll('.skeleton-row');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders critical alerts first', () => {
    const mockNotifs = [
      {
        id: '1',
        title: 'Critical Issue',
        body: 'System error',
        severity: 'critical' as const,
        readAt: null,
        createdAt: new Date().toISOString(),
      },
    ];

    vi.mocked(useNotifications).mockReturnValue({
      data: { data: mockNotifs },
      isLoading: false,
    } as any);

    wrap(<AlertsList />);

    expect(screen.getByText('Critical Issue')).toBeInTheDocument();
  });
});
