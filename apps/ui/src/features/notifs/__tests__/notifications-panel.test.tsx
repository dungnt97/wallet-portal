// UI tests for NotificationsPanel — renders items, unread count, mark-all-read.
// Mocks TanStack Query hooks so no real network calls are made.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockMarkAllRead = vi.fn();
const mockMarkRead = vi.fn();

vi.mock('../use-notifications', () => ({
  useNotifications: vi.fn(),
  useUnreadCount: vi.fn(),
  useMarkRead: vi.fn(),
  useMarkAllRead: vi.fn(),
}));

vi.mock('@/components/overlays/toast-host', () => ({
  useToast: () => vi.fn(),
}));

import { NotificationsPanel } from '@/components/overlays/notifications-panel';
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from '../use-notifications';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ITEMS = [
  {
    id: 'n-001',
    staffId: 'staff-001',
    eventType: 'withdrawal.created',
    severity: 'warning' as const,
    title: 'Withdrawal pending approval',
    body: 'Amount: 1,000 USDT',
    payload: {},
    dedupeKey: null,
    readAt: null,
    digestSentAt: null,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'n-002',
    staffId: 'staff-001',
    eventType: 'deposit.credited',
    severity: 'info' as const,
    title: 'Deposit credited',
    body: null,
    payload: {},
    dedupeKey: null,
    readAt: new Date().toISOString(), // already read
    digestSentAt: null,
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={makeQC()}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationsPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();

    vi.mocked(useNotifications).mockReturnValue({
      data: { data: ITEMS, total: ITEMS.length },
      isLoading: false,
    } as unknown as ReturnType<typeof useNotifications>);

    vi.mocked(useUnreadCount).mockReturnValue({
      data: { count: 1 },
      isLoading: false,
    } as ReturnType<typeof useUnreadCount>);

    vi.mocked(useMarkRead).mockReturnValue({
      mutate: mockMarkRead,
      isPending: false,
    } as unknown as ReturnType<typeof useMarkRead>);

    vi.mocked(useMarkAllRead).mockReturnValue({
      mutate: mockMarkAllRead,
      isPending: false,
    } as unknown as ReturnType<typeof useMarkAllRead>);
  });

  it('does not render when closed', () => {
    render(
      <Wrapper>
        <NotificationsPanel open={false} onClose={vi.fn()} />
      </Wrapper>
    );
    expect(screen.queryByText('Notifications')).toBeNull();
  });

  it('renders notification items when open', () => {
    render(
      <Wrapper>
        <NotificationsPanel open={true} onClose={vi.fn()} />
      </Wrapper>
    );

    expect(screen.getByText('Withdrawal pending approval')).toBeInTheDocument();
    expect(screen.getByText('Deposit credited')).toBeInTheDocument();
  });

  it('shows unread count badge', () => {
    render(
      <Wrapper>
        <NotificationsPanel open={true} onClose={vi.fn()} />
      </Wrapper>
    );

    // Badge shows count = 1 next to the title
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('calls markAllRead mutation when "Mark all read" is clicked', () => {
    render(
      <Wrapper>
        <NotificationsPanel open={true} onClose={vi.fn()} />
      </Wrapper>
    );

    const btn = screen.getByRole('button', { name: /mark all read/i });
    fireEvent.click(btn);

    expect(mockMarkAllRead).toHaveBeenCalledOnce();
  });

  it('calls markRead mutation when an unread item is clicked', () => {
    const onClose = vi.fn();
    render(
      <Wrapper>
        <NotificationsPanel open={true} onClose={onClose} />
      </Wrapper>
    );

    // Click the first item (unread)
    const btn = screen.getByText('Withdrawal pending approval').closest('button');
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);

    expect(mockMarkRead).toHaveBeenCalledWith('n-001');
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT call markRead for already-read items', () => {
    render(
      <Wrapper>
        <NotificationsPanel open={true} onClose={vi.fn()} />
      </Wrapper>
    );

    // Click the second item (already read)
    const btn = screen.getByText('Deposit credited').closest('button');
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);

    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('shows empty state when no items', () => {
    vi.mocked(useNotifications).mockReturnValue({
      data: { data: [], total: 0 },
      isLoading: false,
    } as unknown as ReturnType<typeof useNotifications>);

    vi.mocked(useUnreadCount).mockReturnValue({
      data: { count: 0 },
      isLoading: false,
    } as ReturnType<typeof useUnreadCount>);

    render(
      <Wrapper>
        <NotificationsPanel open={true} onClose={vi.fn()} />
      </Wrapper>
    );

    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    vi.mocked(useNotifications).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useNotifications>);

    render(
      <Wrapper>
        <NotificationsPanel open={true} onClose={vi.fn()} />
      </Wrapper>
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
