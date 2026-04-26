// Tests for features/security/login-history.tsx — paginated login session table.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginHistory } from '../login-history';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/client', () => ({
  api: { get: vi.fn() },
}));

vi.mock('lucide-react', () => ({
  ChevronLeft: () => <span data-testid="chevron-left" />,
  ChevronRight: () => <span data-testid="chevron-right" />,
}));

const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => mockUseQuery(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    success: true,
    ipAddress: '192.168.1.1',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
    failureReason: null,
    createdAt: '2024-01-15T10:30:00Z',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LoginHistory', () => {
  it('shows loading message when query is loading', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<LoginHistory />);
    expect(screen.getByText(/Loading login history/)).toBeInTheDocument();
  });

  it('shows error message when query fails', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<LoginHistory />);
    expect(screen.getByText(/Failed to load login history/)).toBeInTheDocument();
  });

  it('shows no history message when rows are empty', () => {
    mockUseQuery.mockReturnValue({
      data: { data: [], total: 0, page: 1 },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory />);
    expect(screen.getByText(/No login history yet/)).toBeInTheDocument();
  });

  it('shows total attempts count', () => {
    mockUseQuery.mockReturnValue({
      data: { data: [makeSession()], total: 42, page: 1 },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory />);
    expect(screen.getByText('42 attempts')).toBeInTheDocument();
  });

  it('renders Login history heading', () => {
    mockUseQuery.mockReturnValue({
      data: { data: [], total: 0, page: 1 },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory />);
    expect(screen.getByText('Login history')).toBeInTheDocument();
  });

  it('shows success badge for successful session', () => {
    mockUseQuery.mockReturnValue({
      data: { data: [makeSession({ success: true })], total: 1, page: 1 },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory />);
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('shows failure reason badge for failed session', () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: [makeSession({ success: false, failureReason: 'invalid_otp' })],
        total: 1,
        page: 1,
      },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory />);
    expect(screen.getByText('invalid_otp')).toBeInTheDocument();
  });

  it('shows Failed when failureReason is null and session failed', () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: [makeSession({ success: false, failureReason: null })],
        total: 1,
        page: 1,
      },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows IP address in table row', () => {
    mockUseQuery.mockReturnValue({
      data: { data: [makeSession({ ipAddress: '10.0.0.5' })], total: 1, page: 1 },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory />);
    expect(screen.getByText('10.0.0.5')).toBeInTheDocument();
  });

  it('shows dash for null IP address', () => {
    mockUseQuery.mockReturnValue({
      data: { data: [makeSession({ ipAddress: null })], total: 1, page: 1 },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('parses Chrome from user agent string', () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: [
          makeSession({
            userAgent: 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36',
          }),
        ],
        total: 1,
        page: 1,
      },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory />);
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
  });

  it('parses Firefox from user agent string', () => {
    mockUseQuery.mockReturnValue({
      data: {
        data: [makeSession({ userAgent: 'Mozilla/5.0 Firefox/121.0' })],
        total: 1,
        page: 1,
      },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory />);
    expect(screen.getByText(/Firefox/)).toBeInTheDocument();
  });

  it('shows Unknown browser for null user agent', () => {
    mockUseQuery.mockReturnValue({
      data: { data: [makeSession({ userAgent: null })], total: 1, page: 1 },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory />);
    expect(screen.getByText('Unknown browser')).toBeInTheDocument();
  });

  it('does not show pagination when only one page', () => {
    mockUseQuery.mockReturnValue({
      data: { data: [makeSession()], total: 5, page: 1 },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory limit={20} />);
    expect(screen.queryByLabelText('Previous page')).not.toBeInTheDocument();
  });

  it('shows pagination controls when multiple pages exist', () => {
    mockUseQuery.mockReturnValue({
      data: { data: [makeSession()], total: 50, page: 1 },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory limit={20} />);
    expect(screen.getByLabelText('Previous page')).toBeInTheDocument();
    expect(screen.getByLabelText('Next page')).toBeInTheDocument();
  });

  it('previous page button is disabled on first page', () => {
    mockUseQuery.mockReturnValue({
      data: { data: [makeSession()], total: 50, page: 1 },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory limit={20} />);
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
  });

  it('navigates to next page when next button is clicked', async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({
      data: { data: [makeSession()], total: 50, page: 1 },
      isLoading: false,
      isError: false,
    });
    render(<LoginHistory limit={20} />);
    await user.click(screen.getByLabelText('Next page'));
    expect(screen.getByText(/Page 2/)).toBeInTheDocument();
  });
});
