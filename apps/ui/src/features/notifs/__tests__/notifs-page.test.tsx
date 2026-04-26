// Smoke tests for features/notifs/notifs-page.tsx — channels, routing matrix, modals.
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
  Modal: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title?: string;
    onClose?: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    open ? (
      <dialog data-testid="test-modal">
        <h2>{title}</h2>
        {children}
        <div data-testid="modal-footer">{footer}</div>
      </dialog>
    ) : null,
}));

vi.mock('@/components/custody', () => ({
  PageFrame: ({
    title,
    policyStrip,
    actions,
    children,
  }: {
    title: React.ReactNode;
    eyebrow?: React.ReactNode;
    policyStrip?: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="page-frame">
      <h1>{title}</h1>
      <div data-testid="policy-strip">{policyStrip}</div>
      <div data-testid="actions">{actions}</div>
      {children}
    </div>
  ),
  Toggle: ({
    checked,
    onChange,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
  }) => (
    <input
      type="checkbox"
      data-testid="toggle"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  ),
}));

const mockUseAdminChannels = vi.fn();
const mockUseAdminRouting = vi.fn();
const mockUseTestAdminChannel = vi.fn();
const mockUseDeleteAdminChannel = vi.fn();
const mockUseUpdateAdminChannel = vi.fn();
const mockUseUpsertRoutingRule = vi.fn();

vi.mock('@/api/queries', () => ({
  useAdminChannels: () => mockUseAdminChannels(),
  useAdminRouting: () => mockUseAdminRouting(),
  useTestAdminChannel: () => mockUseTestAdminChannel(),
  useDeleteAdminChannel: () => mockUseDeleteAdminChannel(),
  useUpdateAdminChannel: () => mockUseUpdateAdminChannel(),
  useUpsertRoutingRule: () => mockUseUpsertRoutingRule(),
  adminNotifQueryKeys: { channels: ['channels'], routing: ['routing'] },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../channel-form-modal', () => ({
  ChannelFormModal: ({
    open,
    onClose,
    channel,
  }: {
    open: boolean;
    onClose: () => void;
    channel?: unknown;
  }) =>
    open ? (
      <div data-testid="channel-form-modal">
        <button type="button" onClick={onClose}>
          close-channel-form
        </button>
      </div>
    ) : null,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { NotifsPage } from '../notifs-page';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage(channels: unknown[] = [], rules: unknown[] = []) {
  mockUseAdminChannels.mockReturnValue({ data: { data: channels } });
  mockUseAdminRouting.mockReturnValue({ data: { data: rules } });
  mockUseTestAdminChannel.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
  mockUseDeleteAdminChannel.mockReturnValue({ mutate: vi.fn() });
  mockUseUpdateAdminChannel.mockReturnValue({ mutate: vi.fn() });
  mockUseUpsertRoutingRule.mockReturnValue({ mutate: vi.fn() });
  return render(<NotifsPage />);
}

const makeChannel = (id: string, enabled = true) => ({
  id,
  kind: 'email' as const,
  name: `Channel ${id}`,
  enabled,
  config: {},
  createdAt: new Date().toISOString(),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotifsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders page frame', () => {
    renderPage();
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders notifs title', () => {
    renderPage();
    expect(screen.getByText('notifs.title')).toBeInTheDocument();
  });

  it('renders add channel button', () => {
    renderPage();
    expect(screen.getByText('notifs.addChannel')).toBeInTheDocument();
  });

  it('renders send test button', () => {
    renderPage();
    expect(screen.getByText('notifs.sendTest')).toBeInTheDocument();
  });

  it('opens add channel modal when add button clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('notifs.addChannel').closest('button') as HTMLElement);
    expect(screen.getByTestId('channel-form-modal')).toBeInTheDocument();
  });

  it('closes add channel modal on close', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('notifs.addChannel').closest('button') as HTMLElement);
    await user.click(screen.getByText('close-channel-form'));
    expect(screen.queryByTestId('channel-form-modal')).not.toBeInTheDocument();
  });

  it('opens test modal when send test button clicked', async () => {
    const user = userEvent.setup();
    renderPage([makeChannel('ch1')]);
    await user.click(screen.getByText('notifs.sendTest').closest('button') as HTMLElement);
    expect(screen.getByTestId('test-modal')).toBeInTheDocument();
  });

  it('shows empty state when no channels', () => {
    renderPage([]);
    // Both channels table and routing table show common.empty when empty
    expect(screen.getAllByText('common.empty').length).toBeGreaterThanOrEqual(1);
  });

  it('renders channels table title', () => {
    renderPage();
    expect(screen.getByText('notifs.channels.title')).toBeInTheDocument();
  });

  it('renders routing matrix title', () => {
    renderPage();
    expect(screen.getByText('notifs.routing.title')).toBeInTheDocument();
  });

  it('shows active channel count in policy strip', () => {
    renderPage([makeChannel('c1', true), makeChannel('c2', false)]);
    // Policy strip shows count of enabled channels (1)
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows channel names in table', () => {
    renderPage([makeChannel('c1')]);
    expect(screen.getByText('Channel c1')).toBeInTheDocument();
  });

  it('renders routing matrix rows when rules provided', () => {
    const rules = [
      {
        id: 'r1',
        eventType: 'withdrawal.created',
        severity: 'critical',
        channelKind: 'email',
        enabled: true,
      },
    ];
    renderPage([], rules);
    expect(screen.getByText('withdrawal.created')).toBeInTheDocument();
    expect(screen.getByText('critical')).toBeInTheDocument();
  });

  it('renders channel row with edit button', () => {
    renderPage([makeChannel('c1')]);
    expect(screen.getByTitle('notifs.editChannel')).toBeInTheDocument();
  });

  it('opens edit channel modal when edit button clicked', async () => {
    const user = userEvent.setup();
    renderPage([makeChannel('c1')]);
    await user.click(screen.getByTitle('notifs.editChannel'));
    // ChannelFormModal renders with open=true when editChannel is set
    expect(screen.getByTestId('channel-form-modal')).toBeInTheDocument();
  });

  it('renders delete and test buttons for channels', () => {
    renderPage([makeChannel('c1')]);
    expect(screen.getByTitle('notifs.deleteChannel')).toBeInTheDocument();
    // The per-row send test button (title attr) should be present
    const zapBtns = screen.getAllByTitle('notifs.sendTest');
    expect(zapBtns.length).toBeGreaterThan(0);
  });

  it('toast error when send test confirmed with no active channels', async () => {
    const user = userEvent.setup();
    // All channels disabled
    renderPage([makeChannel('c1', false)]);
    // Open the test modal first
    const sendTestBtns = screen.getAllByText('notifs.sendTest');
    await user.click(sendTestBtns[0].closest('button') as HTMLElement);
    // Modal opens — click the confirm send button in the footer (also has notifs.sendTest text)
    const allSendBtns = screen.getAllByText('notifs.sendTest');
    // Click the last occurrence which is inside the modal footer
    await user.click(allSendBtns[allSendBtns.length - 1].closest('button') as HTMLElement);
    expect(mockToast).toHaveBeenCalledWith('No active channels', 'error');
  });
});
