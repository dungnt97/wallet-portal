import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addSigner,
  cancelCeremony,
  fetchCeremonies,
  fetchCeremony,
  removeSigner,
  rotateSigners,
} from '../signers';

vi.mock('../client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from '../client';
const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);

describe('signers API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('addSigner calls POST /signers/add', () => {
    mockPost.mockResolvedValue({} as never);
    addSigner({ targetStaffId: 's-1', reason: 'onboarding' });
    expect(mockPost).toHaveBeenCalledWith('/signers/add', {
      targetStaffId: 's-1',
      reason: 'onboarding',
    });
  });

  it('removeSigner calls POST /signers/remove', () => {
    mockPost.mockResolvedValue({} as never);
    removeSigner({ targetStaffId: 's-1', reason: 'offboarding' });
    expect(mockPost).toHaveBeenCalledWith('/signers/remove', {
      targetStaffId: 's-1',
      reason: 'offboarding',
    });
  });

  it('rotateSigners calls POST /signers/rotate', () => {
    mockPost.mockResolvedValue({} as never);
    rotateSigners({ addStaffIds: ['s-2'], removeStaffIds: ['s-1'], reason: 'rotation' });
    expect(mockPost).toHaveBeenCalledWith('/signers/rotate', {
      addStaffIds: ['s-2'],
      removeStaffIds: ['s-1'],
      reason: 'rotation',
    });
  });

  it('fetchCeremonies calls GET /signers/ceremonies without params', () => {
    mockGet.mockResolvedValue({} as never);
    fetchCeremonies();
    expect(mockGet).toHaveBeenCalledWith('/signers/ceremonies');
  });

  it('fetchCeremonies includes page param', () => {
    mockGet.mockResolvedValue({} as never);
    fetchCeremonies({ page: 2 });
    expect(mockGet).toHaveBeenCalledWith('/signers/ceremonies?page=2');
  });

  it('fetchCeremonies includes limit param', () => {
    mockGet.mockResolvedValue({} as never);
    fetchCeremonies({ limit: 10 });
    expect(mockGet).toHaveBeenCalledWith('/signers/ceremonies?limit=10');
  });

  it('fetchCeremonies includes status param', () => {
    mockGet.mockResolvedValue({} as never);
    fetchCeremonies({ status: 'pending' });
    expect(mockGet).toHaveBeenCalledWith('/signers/ceremonies?status=pending');
  });

  it('fetchCeremony calls GET /signers/ceremonies/:id', () => {
    mockGet.mockResolvedValue({} as never);
    fetchCeremony('cer-1');
    expect(mockGet).toHaveBeenCalledWith('/signers/ceremonies/cer-1');
  });

  it('cancelCeremony calls POST /signers/ceremonies/:id/cancel', () => {
    mockPost.mockResolvedValue({} as never);
    cancelCeremony('cer-1');
    expect(mockPost).toHaveBeenCalledWith('/signers/ceremonies/cer-1/cancel');
  });
});
