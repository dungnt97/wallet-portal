// Smoke tests for features/recovery/recovery-page.tsx — stuck tx list with bump/cancel actions.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('@/components/custody', () => ({
  PageFrame: ({
    title,
    policyStrip,
    children,
  }: {
    title: React.ReactNode;
    eyebrow?: React.ReactNode;
    policyStrip?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="page-frame">
      <h1>{title}</h1>
      <div data-testid="policy-strip">{policyStrip}</div>
      {children}
    </div>
  ),
}));

vi.mock('@/features/_shared/realtime', () => ({
  BlockTicker: ({ chain }: { chain: string }) => <span data-testid={`block-ticker-${chain}`} />,
}));

const mockUseStuckTxs = vi.fn();
vi.mock('../use-recovery', () => ({
  useStuckTxs: () => mockUseStuckTxs(),
}));

vi.mock('../use-recovery-socket', () => ({
  useRecoverySocket: vi.fn(),
}));

vi.mock('../stuck-tx-table', () => ({
  StuckTxTable: ({
    items,
    onBump,
    onCancel,
  }: {
    items: unknown[];
    onBump: (item: unknown) => void;
    onCancel: (item: unknown) => void;
  }) => (
    <div data-testid="stuck-tx-table">
      {items.length} items
      <button type="button" onClick={() => onBump({ id: 'tx-1', chain: 'bnb' })}>
        bump-first
      </button>
      <button type="button" onClick={() => onCancel({ id: 'tx-2', chain: 'sol' })}>
        cancel-first
      </button>
    </div>
  ),
}));

vi.mock('../bump-confirm-modal', () => ({
  BumpConfirmModal: ({ open, onClose }: { open: boolean; item: unknown; onClose: () => void }) =>
    open ? (
      <div data-testid="bump-modal">
        <button type="button" onClick={onClose}>
          close-bump
        </button>
      </div>
    ) : null,
}));

vi.mock('../cancel-confirm-modal', () => ({
  CancelConfirmModal: ({ open, onClose }: { open: boolean; item: unknown; onClose: () => void }) =>
    open ? (
      <div data-testid="cancel-modal">
        <button type="button" onClick={onClose}>
          close-cancel
        </button>
      </div>
    ) : null,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { RecoveryPage } from '../recovery-page';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RecoveryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page frame', () => {
    mockUseStuckTxs.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<RecoveryPage />);
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders recovery title', () => {
    mockUseStuckTxs.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<RecoveryPage />);
    expect(screen.getByText('recovery.title')).toBeInTheDocument();
  });

  it('shows loading card when isLoading', () => {
    mockUseStuckTxs.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<RecoveryPage />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('does not show stuck tx table while loading', () => {
    mockUseStuckTxs.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<RecoveryPage />);
    expect(screen.queryByTestId('stuck-tx-table')).not.toBeInTheDocument();
  });

  it('shows error alert when isError', () => {
    mockUseStuckTxs.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<RecoveryPage />);
    expect(screen.getByText('recovery.loadError')).toBeInTheDocument();
  });

  it('shows retry button in error state', () => {
    const refetch = vi.fn();
    mockUseStuckTxs.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<RecoveryPage />);
    expect(screen.getByText('common.retry')).toBeInTheDocument();
  });

  it('calls refetch when retry button clicked', async () => {
    const refetch = vi.fn();
    mockUseStuckTxs.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    const user = userEvent.setup();
    render(<RecoveryPage />);
    await user.click(screen.getByText('common.retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders stuck tx table when loaded', () => {
    mockUseStuckTxs.mockReturnValue({
      data: { items: [{ id: 'tx-1' }, { id: 'tx-2' }], thresholdsUsed: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<RecoveryPage />);
    expect(screen.getByTestId('stuck-tx-table')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('shows block tickers for bnb and sol', () => {
    mockUseStuckTxs.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<RecoveryPage />);
    expect(screen.getByTestId('block-ticker-bnb')).toBeInTheDocument();
    expect(screen.getByTestId('block-ticker-sol')).toBeInTheDocument();
  });

  it('shows item count in policy strip', () => {
    mockUseStuckTxs.mockReturnValue({
      data: { items: [{ id: 'tx-1' }], thresholdsUsed: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<RecoveryPage />);
    expect(screen.getByText('1 tx')).toBeInTheDocument();
  });

  it('shows threshold values when thresholdsUsed is set', () => {
    mockUseStuckTxs.mockReturnValue({
      data: { items: [], thresholdsUsed: { evmMinutes: 15, solanaSeconds: 30 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<RecoveryPage />);
    expect(screen.getByText('15m')).toBeInTheDocument();
    expect(screen.getByText('30s')).toBeInTheDocument();
  });

  it('opens bump modal when onBump called from table', async () => {
    mockUseStuckTxs.mockReturnValue({
      data: { items: [{ id: 'tx-1' }], thresholdsUsed: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    render(<RecoveryPage />);
    await user.click(screen.getByText('bump-first'));
    expect(screen.getByTestId('bump-modal')).toBeInTheDocument();
  });

  it('closes bump modal when onClose called', async () => {
    mockUseStuckTxs.mockReturnValue({
      data: { items: [{ id: 'tx-1' }], thresholdsUsed: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    render(<RecoveryPage />);
    await user.click(screen.getByText('bump-first'));
    await user.click(screen.getByText('close-bump'));
    expect(screen.queryByTestId('bump-modal')).not.toBeInTheDocument();
  });

  it('opens cancel modal when onCancel called from table', async () => {
    mockUseStuckTxs.mockReturnValue({
      data: { items: [{ id: 'tx-2' }], thresholdsUsed: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    render(<RecoveryPage />);
    await user.click(screen.getByText('cancel-first'));
    expect(screen.getByTestId('cancel-modal')).toBeInTheDocument();
  });

  it('closes cancel modal when onClose called', async () => {
    mockUseStuckTxs.mockReturnValue({
      data: { items: [{ id: 'tx-2' }], thresholdsUsed: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    render(<RecoveryPage />);
    await user.click(screen.getByText('cancel-first'));
    await user.click(screen.getByText('close-cancel'));
    expect(screen.queryByTestId('cancel-modal')).not.toBeInTheDocument();
  });
});
