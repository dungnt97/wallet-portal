// Tests for reconciliation.ts — fetchSnapshots, fetchSnapshotDetail, triggerSnapshot, cancelSnapshot.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelSnapshot,
  fetchSnapshotDetail,
  fetchSnapshots,
  triggerSnapshot,
} from '../reconciliation';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── fetchSnapshots ────────────────────────────────────────────────────────────

describe('fetchSnapshots', () => {
  it('calls api.get /reconciliation/snapshots with no params', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    await fetchSnapshots();
    expect(api.get).toHaveBeenCalledWith('/reconciliation/snapshots');
  });

  it('appends page param to query string', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    await fetchSnapshots({ page: 2 });
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('page=2');
  });

  it('appends limit param to query string', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    await fetchSnapshots({ limit: 50 });
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('limit=50');
  });

  it('appends status param to query string', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0 });
    await fetchSnapshots({ status: 'completed' as never });
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('status=completed');
  });

  it('returns the response data', async () => {
    const { api } = await import('../client');
    const data = { data: [{ id: 'snap-1' }], total: 1 };
    vi.mocked(api.get).mockResolvedValue(data);
    const result = await fetchSnapshots();
    expect(result).toEqual(data);
  });
});

// ── fetchSnapshotDetail ───────────────────────────────────────────────────────

describe('fetchSnapshotDetail', () => {
  it('calls api.get with /reconciliation/snapshots/:id', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ snapshot: { id: 'snap-1' }, drifts: [] });
    await fetchSnapshotDetail('snap-1');
    expect(api.get).toHaveBeenCalledWith('/reconciliation/snapshots/snap-1');
  });

  it('returns snapshot detail response', async () => {
    const { api } = await import('../client');
    const data = { snapshot: { id: 'snap-1', status: 'completed' }, drifts: [] };
    vi.mocked(api.get).mockResolvedValue(data);
    const result = await fetchSnapshotDetail('snap-1');
    expect(result).toEqual(data);
  });
});

// ── triggerSnapshot ───────────────────────────────────────────────────────────

describe('triggerSnapshot', () => {
  it('calls api.post /reconciliation/run with empty body by default', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ jobId: 'job-1', message: 'started' });
    await triggerSnapshot();
    expect(api.post).toHaveBeenCalledWith('/reconciliation/run', {});
  });

  it('passes body to api.post', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ jobId: 'job-2', message: 'started' });
    const body = { chain: 'bnb' } as never;
    await triggerSnapshot(body);
    expect(api.post).toHaveBeenCalledWith('/reconciliation/run', body);
  });

  it('returns jobId and message', async () => {
    const { api } = await import('../client');
    const data = { jobId: 'job-3', message: 'snapshot enqueued' };
    vi.mocked(api.post).mockResolvedValue(data);
    const result = await triggerSnapshot();
    expect(result).toEqual(data);
  });
});

// ── cancelSnapshot ────────────────────────────────────────────────────────────

describe('cancelSnapshot', () => {
  it('calls api.post /reconciliation/snapshots/:id/cancel', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    await cancelSnapshot('snap-1');
    expect(api.post).toHaveBeenCalledWith('/reconciliation/snapshots/snap-1/cancel');
  });

  it('returns ok: true on success', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const result = await cancelSnapshot('snap-1');
    expect(result).toEqual({ ok: true });
  });
});
