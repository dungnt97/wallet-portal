// Tests for features/users/users-detail-sheet.tsx — end-user detail sheet.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUserDetail = vi.fn();
const mockUserBalance = vi.fn();
const mockUserAddresses = vi.fn();
const mockUpdateKyc = vi.fn();
const mockRetryDerive = vi.fn();

vi.mock('@/api/users', () => ({
  KYC_LABELS: { none: 'None', basic: 'T1 Basic', enhanced: 'T3 Enhanced' },
  useUserDetail: (id: string) => mockUserDetail(id),
  useUserBalance: (id: string) => mockUserBalance(id),
  useUserAddresses: (id: string) => mockUserAddresses(id),
  useUpdateKyc: (id: string) => mockUpdateKyc(id),
  useRetryDerive: (id: string) => mockRetryDerive(id),
}));

vi.mock('@/components/custody', () => ({
  Risk: ({ level }: { level: string }) => <span data-testid={`risk-${level}`}>{level}</span>,
}));

vi.mock('@/components/overlays', () => ({
  DetailSheet: ({
    open,
    onClose,
    title,
    subtitle,
    footer,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="detail-sheet">
        <h2>{title}</h2>
        {subtitle && <p data-testid="subtitle">{subtitle}</p>}
        <div data-testid="footer">{footer}</div>
        <button type="button" data-testid="sheet-close" onClick={onClose}>
          close
        </button>
        {children}
      </div>
    ) : null,
  useToast: () => vi.fn(),
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
  fmtDateTime: (iso: string) => `fmt:${iso}`,
  fmtUSD: (n: number) => n.toFixed(2),
}));

vi.mock('@/features/_shared/helpers', () => ({
  addressExplorerUrl: (_chain: string, addr: string) => `https://explorer.example.com/${addr}`,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { UserDetailSheet } from '../users-detail-sheet';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUser(overrides = {}) {
  return {
    id: 'user-abc-001',
    email: 'alice@example.com',
    kycTier: 'basic' as const,
    riskScore: 20,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAddress(chain: string, address: string) {
  return { chain, address, balance: null };
}

function setupDefaultMocks() {
  const mutateKyc = vi.fn();
  const mutateDerive = vi.fn();
  mockUserDetail.mockReturnValue({ data: { user: makeUser() }, isLoading: false });
  mockUserBalance.mockReturnValue({ data: { USDT: '1000', USDC: '500' } });
  mockUserAddresses.mockReturnValue({
    data: {
      addresses: [makeAddress('bnb', '0xbnbaddr'), makeAddress('sol', 'soladdr')],
    },
  });
  mockUpdateKyc.mockReturnValue({ mutate: mutateKyc, isPending: false });
  mockRetryDerive.mockReturnValue({ mutate: mutateDerive, isPending: false });
  return { mutateKyc, mutateDerive };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UserDetailSheet', () => {
  beforeEach(() => {
    mockUserDetail.mockReset();
    mockUserBalance.mockReset();
    mockUserAddresses.mockReset();
    mockUpdateKyc.mockReset();
    mockRetryDerive.mockReset();
  });

  it('renders nothing when userId is null', () => {
    mockUserDetail.mockReturnValue({ data: null, isLoading: false });
    mockUserBalance.mockReturnValue({ data: null });
    mockUserAddresses.mockReturnValue({ data: null });
    mockUpdateKyc.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockRetryDerive.mockReturnValue({ mutate: vi.fn(), isPending: false });
    render(<UserDetailSheet userId={null} showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('detail-sheet')).not.toBeInTheDocument();
  });

  it('renders detail sheet when userId is provided', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByTestId('detail-sheet')).toBeInTheDocument();
  });

  it('shows user email in title', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getAllByText('alice@example.com')[0]).toBeInTheDocument();
  });

  it('shows user ID in subtitle', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByTestId('subtitle').textContent).toContain('user-abc-001');
  });

  it('shows loading state', () => {
    mockUserDetail.mockReturnValue({ data: null, isLoading: true });
    mockUserBalance.mockReturnValue({ data: null });
    mockUserAddresses.mockReturnValue({ data: { addresses: [] } });
    mockUpdateKyc.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockRetryDerive.mockReturnValue({ mutate: vi.fn(), isPending: false });
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows KYC tier badge', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByText('T1 Basic')).toBeInTheDocument();
  });

  it('shows USDT balance', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByText('1000.00')).toBeInTheDocument();
  });

  it('shows USDC balance', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByText('500.00')).toBeInTheDocument();
  });

  it('shows dash for missing balance', () => {
    mockUserDetail.mockReturnValue({ data: { user: makeUser() }, isLoading: false });
    mockUserBalance.mockReturnValue({ data: null });
    mockUserAddresses.mockReturnValue({
      data: { addresses: [makeAddress('bnb', '0xbnb'), makeAddress('sol', 'soladdr')] },
    });
    mockUpdateKyc.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockRetryDerive.mockReturnValue({ mutate: vi.fn(), isPending: false });
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getAllByText('—')[0]).toBeInTheDocument();
  });

  it('shows BNB address', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByText('0xbnbaddr')).toBeInTheDocument();
  });

  it('shows Solana address', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByText('soladdr')).toBeInTheDocument();
  });

  it('shows Not yet provisioned when BNB address missing', () => {
    mockUserDetail.mockReturnValue({ data: { user: makeUser() }, isLoading: false });
    mockUserBalance.mockReturnValue({ data: { USDT: '0', USDC: '0' } });
    mockUserAddresses.mockReturnValue({ data: { addresses: [] } });
    mockUpdateKyc.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockRetryDerive.mockReturnValue({ mutate: vi.fn(), isPending: false });
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getAllByText('Not yet provisioned').length).toBeGreaterThanOrEqual(1);
  });

  it('shows retry-derive banner when addresses missing', () => {
    mockUserDetail.mockReturnValue({ data: { user: makeUser() }, isLoading: false });
    mockUserBalance.mockReturnValue({ data: null });
    mockUserAddresses.mockReturnValue({ data: { addresses: [] } });
    mockUpdateKyc.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockRetryDerive.mockReturnValue({ mutate: vi.fn(), isPending: false });
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByText('Retry derive')).toBeInTheDocument();
  });

  it('does not show retry banner when both addresses present', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.queryByText('Retry derive')).not.toBeInTheDocument();
  });

  it('shows Edit KYC button', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByText('Edit KYC')).toBeInTheDocument();
  });

  it('shows KYC edit form when Edit KYC clicked', async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    await user.click(screen.getByText('Edit KYC'));
    expect(screen.getByText('KYC tier')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('hides KYC form when Cancel clicked', async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    await user.click(screen.getByText('Edit KYC'));
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('KYC tier')).not.toBeInTheDocument();
  });

  it('shows BSCScan link in footer when BNB address present', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByText('BSCScan')).toBeInTheDocument();
  });

  it('shows Solscan link in footer when Sol address present', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByText('Solscan')).toBeInTheDocument();
  });

  it('shows Close button in footer', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('calls onClose when Close clicked', async () => {
    setupDefaultMocks();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={onClose} />);
    await user.click(screen.getByText('Close').closest('button') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows risk component when showRiskFlags is true', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('risk-low')).toBeInTheDocument();
  });

  it('shows high risk for riskScore >= 70', () => {
    mockUserDetail.mockReturnValue({
      data: { user: makeUser({ riskScore: 75 }) },
      isLoading: false,
    });
    mockUserBalance.mockReturnValue({ data: { USDT: '0', USDC: '0' } });
    mockUserAddresses.mockReturnValue({
      data: { addresses: [makeAddress('bnb', '0xbnb'), makeAddress('sol', 'sol')] },
    });
    mockUpdateKyc.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockRetryDerive.mockReturnValue({ mutate: vi.fn(), isPending: false });
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('risk-high')).toBeInTheDocument();
  });

  it('shows formatted join date', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.getByText('fmt:2024-01-01T00:00:00Z')).toBeInTheDocument();
  });

  it('does not show risk component when showRiskFlags is false', () => {
    setupDefaultMocks();
    render(<UserDetailSheet userId="user-abc-001" showRiskFlags={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId(/^risk-/)).not.toBeInTheDocument();
  });
});
