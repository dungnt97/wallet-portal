// Smoke tests for features/signers/signers-page.tsx — tabs, admin modals.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const mockToast = vi.fn();
vi.mock('@/components/overlays', () => ({
  useToast: () => mockToast,
  Sheet: ({
    open,
    title,
    children,
    onClose,
  }: {
    open: boolean;
    title?: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid={`sheet-${title}`}>
        {children}
        <button type="button" onClick={onClose}>
          close-sheet
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/custody', () => ({
  PageFrame: ({
    title,
    policyStrip,
    actions,
    kpis,
    children,
  }: {
    title: React.ReactNode;
    eyebrow?: React.ReactNode;
    policyStrip?: React.ReactNode;
    actions?: React.ReactNode;
    kpis?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="page-frame">
      <h1>{title}</h1>
      <div data-testid="policy-strip">{policyStrip}</div>
      <div data-testid="actions">{actions}</div>
      <div data-testid="kpis">{kpis}</div>
      {children}
    </div>
  ),
  Tabs: ({
    onChange,
    tabs,
  }: {
    value: string;
    onChange: (v: string) => void;
    tabs: Array<{ value: string; label: string; count?: number }>;
    embedded?: boolean;
  }) => (
    <div data-testid="tabs">
      {tabs.map((tab) => (
        <button key={tab.value} type="button" onClick={() => onChange(tab.value)}>
          {tab.label}
        </button>
      ))}
    </div>
  ),
}));

const mockUseAuth = vi.fn();
vi.mock('@/auth/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/features/_shared/realtime', () => ({
  BlockTicker: ({ chain }: { chain: string }) => <span data-testid={`block-ticker-${chain}`} />,
}));

const mockUseCeremonies = vi.fn();
const mockUseStaff = vi.fn();
vi.mock('@/api/signer-ceremony-queries', () => ({
  useCeremonies: (params: unknown) => mockUseCeremonies(params),
  useStaff: () => mockUseStaff(),
}));

vi.mock('./use-signers-socket', () => ({
  useSignersSocket: vi.fn(),
}));

// The signers-page defines use-signers-socket in its own directory
vi.mock('../use-signers-socket', () => ({
  useSignersSocket: vi.fn(),
}));

vi.mock('../signers-kpi-strip', () => ({
  SignersKpiStrip: () => <div data-testid="signers-kpi-strip" />,
}));

vi.mock('../ceremony-progress', () => ({
  CeremonyProgress: ({ ceremony }: { ceremony: unknown }) => (
    <div data-testid="ceremony-progress" />
  ),
}));

vi.mock('../add-signer-modal', () => ({
  AddSignerModal: ({
    onClose,
    onSuccess,
  }: {
    onClose: () => void;
    onSuccess: (id: string) => void;
  }) => (
    <div data-testid="add-signer-modal">
      <button type="button" onClick={onClose}>
        close-add
      </button>
      <button type="button" onClick={() => onSuccess('ceremony-123')}>
        trigger-success
      </button>
    </div>
  ),
}));

vi.mock('../remove-signer-modal', () => ({
  RemoveSignerModal: ({
    onClose,
    onSuccess,
  }: {
    onClose: () => void;
    onSuccess: (id: string) => void;
  }) => (
    <div data-testid="remove-signer-modal">
      <button type="button" onClick={onClose}>
        close-remove
      </button>
      <button type="button" onClick={() => onSuccess('ceremony-456')}>
        trigger-success
      </button>
    </div>
  ),
}));

vi.mock('../rotate-signers-modal', () => ({
  RotateSignersModal: ({
    onClose,
    onSuccess,
  }: {
    onClose: () => void;
    onSuccess: (id: string) => void;
  }) => (
    <div data-testid="rotate-signers-modal">
      <button type="button" onClick={onClose}>
        close-rotate
      </button>
      <button type="button" onClick={() => onSuccess('ceremony-789')}>
        trigger-success
      </button>
    </div>
  ),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { SignersPage } from '../signers-page';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage(role: 'admin' | 'operator' = 'admin') {
  mockUseAuth.mockReturnValue({ staff: { staffId: 'a1', role } });
  mockUseStaff.mockReturnValue({ data: [], isPending: false });
  // useCeremonies called multiple times with different params
  mockUseCeremonies.mockReturnValue({ data: { data: [] }, isPending: false });
  return render(<SignersPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SignersPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders page frame', () => {
    renderPage();
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders signers title', () => {
    renderPage();
    expect(screen.getByText('signers.title')).toBeInTheDocument();
  });

  it('renders KPI strip', () => {
    renderPage();
    expect(screen.getByTestId('signers-kpi-strip')).toBeInTheDocument();
  });

  it('renders tabs', () => {
    renderPage();
    expect(screen.getByTestId('tabs')).toBeInTheDocument();
  });

  it('renders add signer button for admin', () => {
    renderPage('admin');
    expect(screen.getByText('signers.add.title')).toBeInTheDocument();
  });

  it('renders remove signer button for admin', () => {
    renderPage('admin');
    expect(screen.getByText('signers.remove.title')).toBeInTheDocument();
  });

  it('renders rotate signers button for admin', () => {
    renderPage('admin');
    expect(screen.getByText('signers.rotate.title')).toBeInTheDocument();
  });

  it('opens add signer sheet on button click', async () => {
    const user = userEvent.setup();
    renderPage('admin');
    // Click the add button (there may be multiple "signers.add.title" elements from sheet title too)
    const addBtns = screen.getAllByText('signers.add.title');
    await user.click(addBtns[0].closest('button') as HTMLElement);
    expect(screen.getByTestId('add-signer-modal')).toBeInTheDocument();
  });

  it('opens remove signer sheet on button click', async () => {
    const user = userEvent.setup();
    renderPage('admin');
    await user.click(
      screen.getAllByText('signers.remove.title')[0].closest('button') as HTMLElement
    );
    expect(screen.getByTestId('remove-signer-modal')).toBeInTheDocument();
  });

  it('opens rotate signers sheet on button click', async () => {
    const user = userEvent.setup();
    renderPage('admin');
    await user.click(
      screen.getAllByText('signers.rotate.title')[0].closest('button') as HTMLElement
    );
    expect(screen.getByTestId('rotate-signers-modal')).toBeInTheDocument();
  });

  it('closes add sheet when onClose called', async () => {
    const user = userEvent.setup();
    renderPage('admin');
    await user.click(screen.getAllByText('signers.add.title')[0].closest('button') as HTMLElement);
    await user.click(screen.getByText('close-sheet'));
    expect(screen.queryByTestId('add-signer-modal')).not.toBeInTheDocument();
  });

  it('shows empty treasurer table when no treasurers in staff', () => {
    renderPage();
    expect(screen.getByText('common.empty')).toBeInTheDocument();
  });

  it('shows active ceremonies section on tab switch', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('signers.ceremony.activeTabLabel'));
    expect(screen.getByText('signers.ceremony.noneActive')).toBeInTheDocument();
  });

  it('renders block tickers', () => {
    renderPage();
    expect(screen.getByTestId('block-ticker-bnb')).toBeInTheDocument();
    expect(screen.getByTestId('block-ticker-sol')).toBeInTheDocument();
  });

  it('shows ceremony banner after add success and switches to active tab', async () => {
    const user = userEvent.setup();
    renderPage('admin');
    // Open add modal
    await user.click(screen.getAllByText('signers.add.title')[0].closest('button') as HTMLElement);
    // Trigger onSuccess
    await user.click(screen.getByText('trigger-success'));
    // Banner should show the ceremony id
    expect(screen.getByText('ceremony-123')).toBeInTheDocument();
    // Tab should have switched to active ceremonies
    expect(screen.getByText('signers.ceremony.noneActive')).toBeInTheDocument();
  });

  it('dismisses ceremony banner when close button clicked', async () => {
    const user = userEvent.setup();
    renderPage('admin');
    await user.click(screen.getAllByText('signers.add.title')[0].closest('button') as HTMLElement);
    await user.click(screen.getByText('trigger-success'));
    expect(screen.getByText('ceremony-123')).toBeInTheDocument();
    // The banner has a close button (icon only — find via role)
    const closeBtns = screen.getAllByRole('button');
    // The dismiss button is inside the banner — click the one after the ceremony id text
    const bannerClose = closeBtns.find(
      (btn) => btn.closest('.alert') !== null && !btn.textContent?.includes('signers')
    );
    if (bannerClose) await user.click(bannerClose);
    expect(screen.queryByText('ceremony-123')).not.toBeInTheDocument();
  });

  it('hides admin buttons for non-admin role', () => {
    renderPage('operator');
    expect(screen.queryByText('signers.add.title')).not.toBeInTheDocument();
    expect(screen.queryByText('signers.remove.title')).not.toBeInTheDocument();
  });

  it('switches to history tab', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('signers.ceremony.historyTabLabel'));
    // History section renders (empty state for empty data)
    expect(screen.getByText('common.empty')).toBeInTheDocument();
  });

  it('shows loading state in history tab when isPending', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ staff: { staffId: 'a1', role: 'admin' } });
    mockUseStaff.mockReturnValue({ data: [], isPending: false });
    // History uses page param; return isPending=true for that call
    mockUseCeremonies.mockImplementation((params: { page?: number }) => {
      if (params?.page !== undefined) return { data: undefined, isPending: true };
      return { data: { data: [] }, isPending: false };
    });
    render(<SignersPage />);
    await user.click(screen.getByText('signers.ceremony.historyTabLabel'));
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('renders history rows with completed ceremonies', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ staff: { staffId: 'a1', role: 'admin' } });
    mockUseStaff.mockReturnValue({ data: [], isPending: false });
    mockUseCeremonies.mockImplementation((params: { page?: number }) => {
      if (params?.page !== undefined) {
        return {
          data: {
            data: [
              {
                id: 'c1',
                status: 'confirmed',
                chain: 'bnb',
                type: 'add',
                createdAt: new Date().toISOString(),
              },
            ],
            total: 1,
          },
          isPending: false,
        };
      }
      return { data: { data: [] }, isPending: false };
    });
    render(<SignersPage />);
    await user.click(screen.getByText('signers.ceremony.historyTabLabel'));
    expect(screen.getByTestId('ceremony-progress')).toBeInTheDocument();
  });
});
