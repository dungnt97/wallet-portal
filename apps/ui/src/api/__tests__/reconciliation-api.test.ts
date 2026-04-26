import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelSnapshot,
  fetchSnapshotDetail,
  fetchSnapshots,
  triggerSnapshot,
} from '../reconciliation';

vi.mock('../client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from '../client';
const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);

describe('reconciliation API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetchSnapshots calls GET /reconciliation/snapshots without params', () => {
    mockGet.mockResolvedValue({} as never);
    fetchSnapshots();
    expect(mockGet).toHaveBeenCalledWith('/reconciliation/snapshots');
  });

  it('fetchSnapshots includes page param', () => {
    mockGet.mockResolvedValue({} as never);
    fetchSnapshots({ page: 2 });
    expect(mockGet).toHaveBeenCalledWith('/reconciliation/snapshots?page=2');
  });

  it('fetchSnapshots includes limit param', () => {
    mockGet.mockResolvedValue({} as never);
    fetchSnapshots({ limit: 10 });
    expect(mockGet).toHaveBeenCalledWith('/reconciliation/snapshots?limit=10');
  });

  it('fetchSnapshots includes status param', () => {
    mockGet.mockResolvedValue({} as never);
    fetchSnapshots({ status: 'complete' });
    expect(mockGet).toHaveBeenCalledWith('/reconciliation/snapshots?status=complete');
  });

  it('fetchSnapshots combines params', () => {
    mockGet.mockResolvedValue({} as never);
    fetchSnapshots({ page: 1, limit: 5 });
    const call = mockGet.mock.calls[0][0] as string;
    expect(call).toContain('page=1');
    expect(call).toContain('limit=5');
  });

  it('fetchSnapshotDetail calls GET /reconciliation/snapshots/:id', () => {
    mockGet.mockResolvedValue({} as never);
    fetchSnapshotDetail('snap-1');
    expect(mockGet).toHaveBeenCalledWith('/reconciliation/snapshots/snap-1');
  });

  it('triggerSnapshot calls POST /reconciliation/run with empty body', () => {
    mockPost.mockResolvedValue({} as never);
    triggerSnapshot();
    expect(mockPost).toHaveBeenCalledWith('/reconciliation/run', {});
  });

  it('triggerSnapshot calls POST with body', () => {
    mockPost.mockResolvedValue({} as never);
    triggerSnapshot({ chain: 'bnb' });
    expect(mockPost).toHaveBeenCalledWith('/reconciliation/run', { chain: 'bnb' });
  });

  it('cancelSnapshot calls POST /reconciliation/snapshots/:id/cancel', () => {
    mockPost.mockResolvedValue({} as never);
    cancelSnapshot('snap-1');
    expect(mockPost).toHaveBeenCalledWith('/reconciliation/snapshots/snap-1/cancel');
  });
});
