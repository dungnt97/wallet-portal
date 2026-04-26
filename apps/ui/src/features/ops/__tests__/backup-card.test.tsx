// Tests for features/ops/backup-card.tsx — pg_dump trigger + history table.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BackupCard } from '../backup-card';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/components/overlays/toast-host', () => ({
  useToast: () => vi.fn(),
}));

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockTriggerMutate = vi.fn();
const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => mockUseQuery(),
  useMutation: () => mockUseMutation(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    triggeredBy: 'alice@example.com',
    status: 'done',
    s3Key: 'backups/2024-01-01.sql.gz',
    sizeBytes: '1048576',
    durationMs: 800,
    errorMsg: null,
    createdAt: '2024-01-01T10:00:00Z',
    completedAt: '2024-01-01T10:00:01Z',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BackupCard', () => {
  it('shows loading state when query is loading', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('shows no history message when rows are empty', () => {
    mockUseQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    expect(screen.getByText('ops.backup.noHistory')).toBeInTheDocument();
  });

  it('renders trigger button', () => {
    mockUseQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    expect(screen.getByText('ops.backup.triggerBtn')).toBeInTheDocument();
  });

  it('shows triggering label when mutation is pending', () => {
    mockUseQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: true });
    render(<BackupCard />);
    expect(screen.getByText('ops.backup.triggering')).toBeInTheDocument();
  });

  it('disables trigger button when pending', () => {
    mockUseQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: true });
    render(<BackupCard />);
    expect(screen.getByText('ops.backup.triggering').closest('button')).toBeDisabled();
  });

  it('calls mutate when trigger button is clicked', async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    await user.click(screen.getByText('ops.backup.triggerBtn').closest('button') as HTMLElement);
    expect(mockTriggerMutate).toHaveBeenCalled();
  });

  it('renders table with history rows', () => {
    const rows = [makeRow(), makeRow({ id: 'b2', status: 'failed', errorMsg: 'disk full' })];
    mockUseQuery.mockReturnValue({ data: { data: rows }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    expect(screen.getByText('ops.backup.statusDone')).toBeInTheDocument();
    expect(screen.getByText('ops.backup.statusFailed')).toBeInTheDocument();
  });

  it('shows error message snippet in table when row has errorMsg', () => {
    const rows = [makeRow({ status: 'failed', errorMsg: 'Disk quota exceeded on /var/lib/pg' })];
    mockUseQuery.mockReturnValue({ data: { data: rows }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    expect(screen.getByText(/Disk quota exceeded/)).toBeInTheDocument();
  });

  it('formats size in MB when sizeBytes is large', () => {
    const rows = [makeRow({ sizeBytes: '2097152' })]; // 2 MB
    mockUseQuery.mockReturnValue({ data: { data: rows }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    expect(screen.getByText('2.0 MB')).toBeInTheDocument();
  });

  it('formats size in KB when sizeBytes is medium', () => {
    const rows = [makeRow({ sizeBytes: '2048' })]; // 2 KB
    mockUseQuery.mockReturnValue({ data: { data: rows }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('shows dash for null sizeBytes', () => {
    const rows = [makeRow({ sizeBytes: null })];
    mockUseQuery.mockReturnValue({ data: { data: rows }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    // At least one dash should appear (size column)
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows duration in ms', () => {
    const rows = [makeRow({ durationMs: 1234 })];
    mockUseQuery.mockReturnValue({ data: { data: rows }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    expect(screen.getByText('1234ms')).toBeInTheDocument();
  });

  it('shows dry-run note when all s3Keys start with [dry-run]', () => {
    const rows = [makeRow({ s3Key: '[dry-run]test-key' })];
    mockUseQuery.mockReturnValue({ data: { data: rows }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    expect(screen.getByText('ops.backup.dryRunNote')).toBeInTheDocument();
  });

  it('does not show dry-run note when a real s3Key exists', () => {
    const rows = [makeRow({ s3Key: 'backups/real-backup.sql.gz' })];
    mockUseQuery.mockReturnValue({ data: { data: rows }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    expect(screen.queryByText('ops.backup.dryRunNote')).not.toBeInTheDocument();
  });

  it('renders all status pill variants', () => {
    const rows = [
      makeRow({ id: '1', status: 'pending' }),
      makeRow({ id: '2', status: 'running' }),
      makeRow({ id: '3', status: 'done' }),
      makeRow({ id: '4', status: 'failed' }),
    ];
    mockUseQuery.mockReturnValue({ data: { data: rows }, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: mockTriggerMutate, isPending: false });
    render(<BackupCard />);
    expect(screen.getByText('ops.backup.statusPending')).toBeInTheDocument();
    expect(screen.getByText('ops.backup.statusRunning')).toBeInTheDocument();
    expect(screen.getByText('ops.backup.statusDone')).toBeInTheDocument();
    expect(screen.getByText('ops.backup.statusFailed')).toBeInTheDocument();
  });
});
