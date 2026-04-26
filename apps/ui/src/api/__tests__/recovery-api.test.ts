import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bumpTx, cancelTx, fetchStuckTxs } from '../recovery';

vi.mock('../client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from '../client';
const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);

describe('recovery API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetchStuckTxs calls GET /recovery/stuck', () => {
    mockGet.mockResolvedValue({} as never);
    fetchStuckTxs();
    expect(mockGet).toHaveBeenCalledWith('/recovery/stuck');
  });

  it('bumpTx calls POST /recovery/withdrawal/:id/bump', () => {
    mockPost.mockResolvedValue({} as never);
    bumpTx('withdrawal', 'wd-1', { idempotencyKey: 'key-1' });
    expect(mockPost).toHaveBeenCalledWith('/recovery/withdrawal/wd-1/bump', {
      idempotencyKey: 'key-1',
    });
  });

  it('bumpTx calls POST /recovery/sweep/:id/bump', () => {
    mockPost.mockResolvedValue({} as never);
    bumpTx('sweep', 'sw-1', { idempotencyKey: 'key-2' });
    expect(mockPost).toHaveBeenCalledWith('/recovery/sweep/sw-1/bump', {
      idempotencyKey: 'key-2',
    });
  });

  it('cancelTx calls POST /recovery/withdrawal/:id/cancel', () => {
    mockPost.mockResolvedValue({} as never);
    cancelTx('withdrawal', 'wd-1', { idempotencyKey: 'key-3' });
    expect(mockPost).toHaveBeenCalledWith('/recovery/withdrawal/wd-1/cancel', {
      idempotencyKey: 'key-3',
    });
  });

  it('cancelTx calls POST /recovery/sweep/:id/cancel', () => {
    mockPost.mockResolvedValue({} as never);
    cancelTx('sweep', 'sw-2', { idempotencyKey: 'key-4' });
    expect(mockPost).toHaveBeenCalledWith('/recovery/sweep/sw-2/cancel', {
      idempotencyKey: 'key-4',
    });
  });
});
