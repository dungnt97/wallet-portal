// Tests for features/ops/staff-sync-card.tsx — Google Workspace staff sync trigger.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StaffSyncCard } from '../staff-sync-card';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockToast = vi.fn();
vi.mock('@/components/overlays/toast-host', () => ({
  useToast: () => mockToast,
}));

vi.mock('@/api/client', () => ({
  api: { post: vi.fn() },
}));

const mockMutate = vi.fn();
const mockUseMutation = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => mockUseMutation(),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StaffSyncCard', () => {
  it('renders card title', () => {
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false });
    render(<StaffSyncCard />);
    expect(screen.getByText('ops.staffSync.cardTitle')).toBeInTheDocument();
  });

  it('shows neverSynced label initially', () => {
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false });
    render(<StaffSyncCard />);
    expect(screen.getByText('ops.staffSync.neverSynced')).toBeInTheDocument();
  });

  it('renders sync button', () => {
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false });
    render(<StaffSyncCard />);
    expect(screen.getByText('ops.staffSync.syncBtn')).toBeInTheDocument();
  });

  it('disables sync button when pending', () => {
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: true });
    render(<StaffSyncCard />);
    expect(screen.getByText('ops.staffSync.syncing').closest('button')).toBeDisabled();
  });

  it('shows syncing label when mutation is pending', () => {
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: true });
    render(<StaffSyncCard />);
    expect(screen.getByText('ops.staffSync.syncing')).toBeInTheDocument();
  });

  it('calls mutate when sync button is clicked', async () => {
    const user = userEvent.setup();
    mockUseMutation.mockReturnValue({ mutate: mockMutate, isPending: false });
    render(<StaffSyncCard />);
    await user.click(screen.getByText('ops.staffSync.syncBtn').closest('button') as HTMLElement);
    expect(mockMutate).toHaveBeenCalled();
  });

  it('shows stub note when onError fires with credentials-not-configured message', async () => {
    const user = userEvent.setup();
    let capturedOnError: ((err: Error) => void) | undefined;
    mockUseMutation.mockReturnValue({
      mutate: vi.fn((_: unknown, opts: { onError: (err: Error) => void }) => {
        capturedOnError = opts.onError;
      }),
      isPending: false,
    });
    render(<StaffSyncCard />);
    await user.click(screen.getByText('ops.staffSync.syncBtn').closest('button') as HTMLElement);
    await act(async () => {
      capturedOnError?.(new Error('credentials not configured'));
    });
    expect(screen.getByText('ops.staffSync.stubNote')).toBeInTheDocument();
  });

  it('shows stub note when onError fires with NOT_IMPLEMENTED message', async () => {
    const user = userEvent.setup();
    let capturedOnError: ((err: Error) => void) | undefined;
    mockUseMutation.mockReturnValue({
      mutate: vi.fn((_: unknown, opts: { onError: (err: Error) => void }) => {
        capturedOnError = opts.onError;
      }),
      isPending: false,
    });
    render(<StaffSyncCard />);
    await user.click(screen.getByText('ops.staffSync.syncBtn').closest('button') as HTMLElement);
    await act(async () => {
      capturedOnError?.(new Error('NOT_IMPLEMENTED'));
    });
    expect(screen.getByText('ops.staffSync.stubNote')).toBeInTheDocument();
  });

  it('fires toast with error message for generic errors', async () => {
    const user = userEvent.setup();
    let capturedOnError: ((err: Error) => void) | undefined;
    mockUseMutation.mockReturnValue({
      mutate: vi.fn((_: unknown, opts: { onError: (err: Error) => void }) => {
        capturedOnError = opts.onError;
      }),
      isPending: false,
    });
    render(<StaffSyncCard />);
    await user.click(screen.getByText('ops.staffSync.syncBtn').closest('button') as HTMLElement);
    await act(async () => {
      capturedOnError?.(new Error('network failure'));
    });
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('ops.staffSync.error'), 'error');
  });

  it('fires success toast after successful sync', async () => {
    const user = userEvent.setup();
    let capturedOnSuccess: ((result: { synced: number; note?: string }) => void) | undefined;
    mockUseMutation.mockReturnValue({
      mutate: vi.fn(
        (_: unknown, opts: { onSuccess: (result: { synced: number; note?: string }) => void }) => {
          capturedOnSuccess = opts.onSuccess;
        }
      ),
      isPending: false,
    });
    render(<StaffSyncCard />);
    await user.click(screen.getByText('ops.staffSync.syncBtn').closest('button') as HTMLElement);
    await act(async () => {
      capturedOnSuccess?.({ synced: 5 });
    });
    expect(mockToast).toHaveBeenCalledWith('ops.staffSync.success', 'success');
  });

  it('shows result.note stub note when onSuccess includes note', async () => {
    const user = userEvent.setup();
    let capturedOnSuccess: ((result: { synced: number; note?: string }) => void) | undefined;
    mockUseMutation.mockReturnValue({
      mutate: vi.fn(
        (_: unknown, opts: { onSuccess: (result: { synced: number; note?: string }) => void }) => {
          capturedOnSuccess = opts.onSuccess;
        }
      ),
      isPending: false,
    });
    render(<StaffSyncCard />);
    await user.click(screen.getByText('ops.staffSync.syncBtn').closest('button') as HTMLElement);
    await act(async () => {
      capturedOnSuccess?.({ synced: 0, note: 'Dry-run mode: credentials not wired' });
    });
    expect(screen.getByText('Dry-run mode: credentials not wired')).toBeInTheDocument();
  });

  it('shows lastSync timestamp after successful sync', async () => {
    const user = userEvent.setup();
    let capturedOnSuccess: ((result: { synced: number; note?: string }) => void) | undefined;
    mockUseMutation.mockReturnValue({
      mutate: vi.fn(
        (_: unknown, opts: { onSuccess: (result: { synced: number; note?: string }) => void }) => {
          capturedOnSuccess = opts.onSuccess;
        }
      ),
      isPending: false,
    });
    render(<StaffSyncCard />);
    await user.click(screen.getByText('ops.staffSync.syncBtn').closest('button') as HTMLElement);
    await act(async () => {
      capturedOnSuccess?.({ synced: 3 });
    });
    expect(screen.getByText('ops.staffSync.lastSync')).toBeInTheDocument();
  });
});
