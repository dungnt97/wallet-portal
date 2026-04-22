import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import i18n from 'i18next';
// Vitest component tests for AuditPage filter bar.
// Tests rendered UI behavior: tabs, filter inputs, export button state.
// NOTE: Due to Vite ESM live binding semantics, hooks called inside the component
// cannot be spied on via vi.mock alone. Tests assert DOM behavior instead.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../use-audit-logs', () => ({
  AUDIT_QUERY_KEY: 'audit',
  useAuditLogs: vi.fn(() => ({
    data: { data: [], total: 0, page: 1, limit: 50 },
    isLoading: false,
  })),
  useAuditVerify: vi.fn(() => ({ data: undefined })),
}));

vi.mock('../audit-socket-listener', () => ({
  useAuditSocketListener: vi.fn(),
}));

vi.mock('@/api/socket', () => ({
  connectSocket: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    connected: false,
    connect: vi.fn(),
  })),
  disconnectSocket: vi.fn(),
}));

vi.mock('@/components/overlays', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/overlays')>();
  return {
    ...actual,
    useToast: () => vi.fn(),
    // Simplified Sheet that renders children when open
    Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div data-testid="sheet">{children}</div> : null,
  };
});

// Static import — vi.mock hoisting ensures mocks are applied before this resolves
import { AuditPage } from '../audit-page';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <AuditPage />
    </QueryClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuditPage filter bar', () => {
  it('renders Actions and Sign-ins tabs', () => {
    renderPage();
    // Tabs render translated labels (en: "Actions" and "Sign-ins")
    expect(screen.getByText('Actions')).toBeDefined();
    expect(screen.getByText('Sign-ins')).toBeDefined();
  });

  it('Actions tab is active by default — table renders with empty state', () => {
    renderPage();
    // With empty data mock the table is rendered (Actions tab is default)
    const table = document.querySelector('table');
    expect(table).not.toBeNull();
  });

  it('renders a text input in the filter bar', () => {
    renderPage();
    const inputs = document.querySelectorAll('input');
    // At least one input (the action search field)
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('input accepts typed text', () => {
    renderPage();
    const input = document.querySelector('input') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'withdrawal' } });
    });
    expect(input.value).toBe('withdrawal');
  });

  it('renders an export button', () => {
    renderPage();
    const buttons = Array.from(document.querySelectorAll('button'));
    const exportBtn = buttons.find(
      (b) =>
        b.textContent?.toLowerCase().includes('export') ||
        b.textContent?.toLowerCase().includes('csv')
    );
    expect(exportBtn).toBeDefined();
  });

  it('export button is enabled on Actions tab', () => {
    renderPage();
    const buttons = Array.from(document.querySelectorAll('button'));
    const exportBtn = buttons.find(
      (b) =>
        b.textContent?.toLowerCase().includes('export') ||
        b.textContent?.toLowerCase().includes('csv')
    ) as HTMLButtonElement | undefined;
    expect(exportBtn).toBeDefined();
    expect(exportBtn?.disabled).toBe(false);
  });

  it('export button is disabled when Sign-ins tab is active', () => {
    renderPage();

    // Click Sign-ins tab — state update is synchronous in React 18 with act()
    act(() => {
      fireEvent.click(screen.getByText('Sign-ins'));
    });

    // Re-query after state update
    const buttons = Array.from(document.querySelectorAll('button'));
    // Debug: log all button texts + disabled states
    const exportBtn = buttons.find(
      (b) =>
        b.textContent?.toLowerCase().includes('export') ||
        b.textContent?.toLowerCase().includes('csv')
    ) as HTMLButtonElement | undefined;

    expect(exportBtn).toBeDefined();
    // The button has disabled attribute — check via getAttribute for jsdom compatibility
    const isDisabled = exportBtn?.disabled || exportBtn?.getAttribute('disabled') !== null;
    expect(isDisabled).toBe(true);
  });

  it('switching to Sign-ins tab hides the search input', () => {
    renderPage();
    expect(document.querySelectorAll('input').length).toBeGreaterThan(0);

    act(() => {
      fireEvent.click(screen.getByText('Sign-ins'));
    });

    // No filter inputs visible on Sign-ins tab (it uses fixture table)
    expect(document.querySelectorAll('input').length).toBe(0);
  });
});
