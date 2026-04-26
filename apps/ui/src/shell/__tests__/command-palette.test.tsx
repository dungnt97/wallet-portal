// Tests for shell/command-palette.tsx — ⌘K command palette navigation + search.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal<typeof import('react-router-dom')>();
  return { ...real, useNavigate: () => mockNavigate };
});

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

const mockUseSearch = vi.fn();
vi.mock('../use-search', () => ({
  useSearch: (q: string) => mockUseSearch(q),
}));

vi.mock('../nav-structure', () => ({
  NAV: [
    {
      items: [
        { id: 'dashboard', labelKey: 'nav.dashboard', iconKey: 'Home', to: '/dashboard' },
        { id: 'withdrawals', labelKey: 'nav.withdrawals', iconKey: 'ArrowUp', to: '/withdrawals' },
      ],
    },
  ],
}));

// jsdom doesn't implement scrollIntoView — polyfill to prevent errors
Element.prototype.scrollIntoView = vi.fn();

// Import after mocks
import { CommandPalette } from '../command-palette';

// ── Helpers ────────────────────────────────────────────────────────────────

function renderPalette(props: { open: boolean; onClose?: () => void }) {
  return render(
    <MemoryRouter>
      <CommandPalette open={props.open} onClose={props.onClose ?? vi.fn()} />
    </MemoryRouter>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearch.mockReturnValue({ results: [], isLoading: false });
  });

  it('renders nothing when closed', () => {
    renderPalette({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog when open', () => {
    renderPalette({ open: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders search input with placeholder', () => {
    renderPalette({ open: true });
    expect(screen.getByLabelText('Command palette search')).toBeInTheDocument();
  });

  it('shows navigate label in section header by default', () => {
    renderPalette({ open: true });
    // cmd-section header contains "Navigate" (multiple in DOM via cmd-kind too)
    expect(screen.getAllByText('Navigate').length).toBeGreaterThan(0);
  });

  it('shows nav items in default state', () => {
    renderPalette({ open: true });
    expect(screen.getByText('Go to nav.dashboard')).toBeInTheDocument();
    expect(screen.getByText('Go to nav.withdrawals')).toBeInTheDocument();
  });

  it('shows N results label when typing 2+ chars', async () => {
    mockUseSearch.mockReturnValue({
      results: [
        {
          id: 'r1',
          label: 'Alice Smith',
          subtitle: 'alice@co.com',
          type: 'user',
          href: '/users/1',
        },
      ],
      isLoading: false,
    });
    const user = userEvent.setup();
    renderPalette({ open: true });
    await user.type(screen.getByLabelText('Command palette search'), 'al');
    expect(screen.getByText(/result/i)).toBeInTheDocument();
  });

  it('shows spinner element when isLoading', async () => {
    mockUseSearch.mockReturnValue({ results: [], isLoading: true });
    const user = userEvent.setup();
    renderPalette({ open: true });
    await user.type(screen.getByLabelText('Command palette search'), 'al');
    // cmd-spinner span is rendered next to input when searching
    expect(document.querySelector('.cmd-spinner')).toBeInTheDocument();
  });

  it('shows no-results message when query has 2+ chars and no results', async () => {
    mockUseSearch.mockReturnValue({ results: [], isLoading: false });
    const user = userEvent.setup();
    renderPalette({ open: true });
    await user.type(screen.getByLabelText('Command palette search'), 'zzz');
    expect(screen.getByText(/No results for/)).toBeInTheDocument();
  });

  it('filters nav items when query is 1 char (below search threshold)', async () => {
    const user = userEvent.setup();
    renderPalette({ open: true });
    // "b" (1 char) is in "Go to nav.dashboard" but NOT in "Go to nav.withdrawals"
    // → showSearch remains false (q.length < 2) so client-side nav filter applies
    await user.type(screen.getByLabelText('Command palette search'), 'b');
    expect(screen.getByText('Go to nav.dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Go to nav.withdrawals')).not.toBeInTheDocument();
  });

  it('calls onClose when clicking scrim (backdrop)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPalette({ open: true, onClose });
    // The scrim is the outer div with role="dialog"
    const dialog = screen.getByRole('dialog');
    await user.click(dialog);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls navigate and onClose when clicking a nav item', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPalette({ open: true, onClose });
    await user.click(screen.getByText('Go to nav.dashboard').closest('button') as HTMLElement);
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key pressed on scrim', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPalette({ open: true, onClose });
    const dialog = screen.getByRole('dialog');
    await user.type(dialog, '{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows search results when query has 2+ chars', async () => {
    mockUseSearch.mockReturnValue({
      results: [
        {
          id: 'u1',
          label: 'Alice Smith',
          subtitle: 'alice@test.com',
          type: 'user',
          href: '/users/alice',
        },
      ],
      isLoading: false,
    });
    const user = userEvent.setup();
    renderPalette({ open: true });
    await user.type(screen.getByLabelText('Command palette search'), 'al');
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('navigates to search result href when clicked', async () => {
    const onClose = vi.fn();
    mockUseSearch.mockReturnValue({
      results: [
        { id: 'u1', label: 'Alice Smith', subtitle: '', type: 'user', href: '/users/alice' },
      ],
      isLoading: false,
    });
    const user = userEvent.setup();
    renderPalette({ open: true, onClose });
    await user.type(screen.getByLabelText('Command palette search'), 'al');
    await user.click(screen.getByText('Alice Smith').closest('button') as HTMLElement);
    expect(mockNavigate).toHaveBeenCalledWith('/users/alice');
    expect(onClose).toHaveBeenCalled();
  });
});
