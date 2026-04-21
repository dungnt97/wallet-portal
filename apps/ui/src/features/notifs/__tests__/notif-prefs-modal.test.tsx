// UI tests for NotifPrefsModal — renders toggles, fires PATCH mutation on change.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockPatch = vi.fn();

vi.mock('../use-notifications', () => ({
  useNotificationPrefs: vi.fn(),
  usePatchNotificationPrefs: vi.fn(),
}));

vi.mock('@/components/overlays/toast-host', () => ({
  useToast: () => vi.fn(),
}));

import { NotifPrefsModal } from '../notif-prefs-modal';
import { useNotificationPrefs, usePatchNotificationPrefs } from '../use-notifications';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DEFAULT_PREFS = {
  inApp: true,
  email: true,
  slack: false,
  eventTypes: {
    withdrawal: true,
    sweep: true,
    deposit: true,
    killSwitch: true,
    reorg: true,
    health: true,
    coldTimelock: true,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={makeQC()}>{children}</QueryClientProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotifPrefsModal', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();

    vi.mocked(useNotificationPrefs).mockReturnValue({
      data: DEFAULT_PREFS,
      isLoading: false,
    } as ReturnType<typeof useNotificationPrefs>);

    vi.mocked(usePatchNotificationPrefs).mockReturnValue({
      mutate: mockPatch,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof usePatchNotificationPrefs>);
  });

  it('does not render when closed', () => {
    render(
      <Wrapper>
        <NotifPrefsModal open={false} onClose={vi.fn()} />
      </Wrapper>
    );
    expect(screen.queryByText('Notification settings')).toBeNull();
  });

  it('renders channel toggles and event-type toggles when open', () => {
    render(
      <Wrapper>
        <NotifPrefsModal open={true} onClose={vi.fn()} />
      </Wrapper>
    );

    // Channel labels
    expect(screen.getByText('In-app (bell)')).toBeInTheDocument();
    expect(screen.getByText('Email digest')).toBeInTheDocument();
    expect(screen.getByText('Slack')).toBeInTheDocument();

    // Event-type labels
    expect(screen.getByText('Withdrawal events')).toBeInTheDocument();
    expect(screen.getByText('Kill switch')).toBeInTheDocument();
    expect(screen.getByText('Cold timelock expiry')).toBeInTheDocument();
  });

  it('reflects current prefs state — inApp checked, slack unchecked', () => {
    render(
      <Wrapper>
        <NotifPrefsModal open={true} onClose={vi.fn()} />
      </Wrapper>
    );

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // inApp=true → first checkbox checked
    const inAppCheckbox = checkboxes.find((cb) =>
      cb.closest('label')?.textContent?.includes('In-app')
    );
    expect(inAppCheckbox?.checked).toBe(true);

    // slack=false → slack checkbox unchecked
    const slackCheckbox = checkboxes.find((cb) =>
      cb.closest('label')?.textContent?.includes('Slack')
    );
    expect(slackCheckbox?.checked).toBe(false);
  });

  it('calls patch mutation with channel update when toggle clicked', () => {
    render(
      <Wrapper>
        <NotifPrefsModal open={true} onClose={vi.fn()} />
      </Wrapper>
    );

    // Toggle the Slack checkbox (currently false → true)
    const slackCheckbox = screen
      .getAllByRole('checkbox')
      .find((cb) => cb.closest('label')?.textContent?.includes('Slack'));
    expect(slackCheckbox).not.toBeUndefined();
    fireEvent.click(slackCheckbox!);

    expect(mockPatch).toHaveBeenCalledWith(
      { slack: true },
      expect.any(Object) // onSuccess callback options
    );
  });

  it('calls patch mutation with eventTypes update when event toggle clicked', () => {
    render(
      <Wrapper>
        <NotifPrefsModal open={true} onClose={vi.fn()} />
      </Wrapper>
    );

    // Toggle the Withdrawal events checkbox (currently true → false)
    const withdrawalCheckbox = screen
      .getAllByRole('checkbox')
      .find((cb) => cb.closest('label')?.textContent?.includes('Withdrawal events'));
    expect(withdrawalCheckbox).not.toBeUndefined();
    fireEvent.click(withdrawalCheckbox!);

    expect(mockPatch).toHaveBeenCalledWith(
      { eventTypes: { withdrawal: false } },
      expect.any(Object)
    );
  });

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Wrapper>
        <NotifPrefsModal open={true} onClose={onClose} />
      </Wrapper>
    );

    // Modal renders two "close" buttons: the X icon-btn header button and the
    // footer text button. Click the footer one (has visible text).
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    // Footer button has text content "Close"; icon button has aria-label only.
    const footerBtn = closeButtons.find((btn) => btn.textContent?.trim() === 'Close');
    expect(footerBtn).toBeDefined();
    fireEvent.click(footerBtn!);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows loading state while prefs are fetching', () => {
    vi.mocked(useNotificationPrefs).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useNotificationPrefs>);

    render(
      <Wrapper>
        <NotifPrefsModal open={true} onClose={vi.fn()} />
      </Wrapper>
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
