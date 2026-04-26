// Tests for signers.ts — raw API fetchers for signer ceremony endpoints.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addSigner,
  cancelCeremony,
  fetchCeremonies,
  fetchCeremony,
  removeSigner,
  rotateSigners,
} from '../signers';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── addSigner ─────────────────────────────────────────────────────────────────

describe('addSigner', () => {
  it('calls api.post /signers/add with body', async () => {
    const { api } = await import('../client');
    const result = { ceremonyId: 'c1', bnbOpId: 'op-bnb', solanaOpId: 'op-sol' };
    vi.mocked(api.post).mockResolvedValue(result);
    const body = { targetStaffId: 'staff-1', reason: 'expand multisig' };
    const res = await addSigner(body);
    expect(api.post).toHaveBeenCalledWith('/signers/add', body);
    expect(res).toEqual(result);
  });
});

// ── removeSigner ──────────────────────────────────────────────────────────────

describe('removeSigner', () => {
  it('calls api.post /signers/remove with body', async () => {
    const { api } = await import('../client');
    const result = { ceremonyId: 'c2', bnbOpId: 'op-bnb', solanaOpId: 'op-sol' };
    vi.mocked(api.post).mockResolvedValue(result);
    const body = { targetStaffId: 'staff-2', reason: 'offboarding' };
    const res = await removeSigner(body);
    expect(api.post).toHaveBeenCalledWith('/signers/remove', body);
    expect(res).toEqual(result);
  });
});

// ── rotateSigners ─────────────────────────────────────────────────────────────

describe('rotateSigners', () => {
  it('calls api.post /signers/rotate with body', async () => {
    const { api } = await import('../client');
    const result = { ceremonyId: 'c3', bnbOpId: 'op-bnb', solanaOpId: 'op-sol' };
    vi.mocked(api.post).mockResolvedValue(result);
    const body = {
      addStaffIds: ['staff-3'],
      removeStaffIds: ['staff-1'],
      reason: 'key rotation',
    };
    const res = await rotateSigners(body);
    expect(api.post).toHaveBeenCalledWith('/signers/rotate', body);
    expect(res).toEqual(result);
  });
});

// ── fetchCeremonies ───────────────────────────────────────────────────────────

describe('fetchCeremonies', () => {
  it('calls api.get /signers/ceremonies with no params', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    await fetchCeremonies();
    expect(vi.mocked(api.get).mock.calls[0][0]).toBe('/signers/ceremonies');
  });

  it('calls api.get with page param in query string', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 2 });
    await fetchCeremonies({ page: 2 });
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('page=2');
  });

  it('calls api.get with limit param in query string', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    await fetchCeremonies({ limit: 20 });
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('limit=20');
  });

  it('calls api.get with status param in query string', async () => {
    const { api } = await import('../client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    await fetchCeremonies({ status: 'pending' });
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('status=pending');
  });

  it('returns ceremonies page data', async () => {
    const { api } = await import('../client');
    const page = {
      data: [{ id: 'c1', operationType: 'signer_add', status: 'confirmed' }],
      total: 1,
      page: 1,
    };
    vi.mocked(api.get).mockResolvedValue(page);
    const res = await fetchCeremonies();
    expect(res).toEqual(page);
  });
});

// ── fetchCeremony ─────────────────────────────────────────────────────────────

describe('fetchCeremony', () => {
  it('calls api.get /signers/ceremonies/:id', async () => {
    const { api } = await import('../client');
    const row = { id: 'c1', operationType: 'signer_add', status: 'in_progress' };
    vi.mocked(api.get).mockResolvedValue(row);
    const res = await fetchCeremony('c1');
    expect(api.get).toHaveBeenCalledWith('/signers/ceremonies/c1');
    expect(res).toEqual(row);
  });
});

// ── cancelCeremony ────────────────────────────────────────────────────────────

describe('cancelCeremony', () => {
  it('calls api.post /signers/ceremonies/:id/cancel', async () => {
    const { api } = await import('../client');
    vi.mocked(api.post).mockResolvedValue(undefined);
    await cancelCeremony('c1');
    expect(api.post).toHaveBeenCalledWith('/signers/ceremonies/c1/cancel');
  });
});
