// Tests for use-audit-logs.ts — AUDIT_QUERY_KEY, useAuditLogs, useAuditVerify hooks.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_QUERY_KEY, useAuditLogs, useAuditVerify } from '../use-audit-logs';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../api/client', () => ({
  api: { get: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) =>
      QueryClientProvider({ client: qc, children }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── AUDIT_QUERY_KEY ───────────────────────────────────────────────────────────

describe('AUDIT_QUERY_KEY', () => {
  it('is the string "audit"', () => {
    expect(AUDIT_QUERY_KEY).toBe('audit');
  });
});

// ── useAuditLogs ──────────────────────────────────────────────────────────────

describe('useAuditLogs', () => {
  it('fetches audit logs and returns data', async () => {
    const { api } = await import('../../../api/client');
    const data = { data: [{ id: 'log-1', action: 'login' }], total: 1, page: 1 };
    vi.mocked(api.get).mockResolvedValue(data);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuditLogs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });

  it('calls api.get with default page=1 and limit=50', async () => {
    const { api } = await import('../../../api/client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuditLogs(), { wrapper });
    await waitFor(() => !result.current.isLoading);
    const url = vi.mocked(api.get).mock.calls[0][0] as string;
    expect(url).toContain('page=1');
    expect(url).toContain('limit=50');
  });

  it('includes entity filter in query string', async () => {
    const { api } = await import('../../../api/client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuditLogs({ entity: 'withdrawal' }), { wrapper });
    await waitFor(() => !result.current.isLoading);
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('entity=withdrawal');
  });

  it('includes actor filter in query string', async () => {
    const { api } = await import('../../../api/client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuditLogs({ actor: 'staff-1' }), { wrapper });
    await waitFor(() => !result.current.isLoading);
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('actor=staff-1');
  });

  it('includes action filter in query string', async () => {
    const { api } = await import('../../../api/client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuditLogs({ action: 'approve' }), { wrapper });
    await waitFor(() => !result.current.isLoading);
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('action=approve');
  });

  it('includes from/to date filters in query string', async () => {
    const { api } = await import('../../../api/client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 1 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuditLogs({ from: '2024-01-01', to: '2024-12-31' }), {
      wrapper,
    });
    await waitFor(() => !result.current.isLoading);
    const url = vi.mocked(api.get).mock.calls[0][0] as string;
    expect(url).toContain('from=2024-01-01');
    expect(url).toContain('to=2024-12-31');
  });

  it('respects custom page and limit params', async () => {
    const { api } = await import('../../../api/client');
    vi.mocked(api.get).mockResolvedValue({ data: [], total: 0, page: 3 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuditLogs({ page: 3, limit: 100 }), { wrapper });
    await waitFor(() => !result.current.isLoading);
    const url = vi.mocked(api.get).mock.calls[0][0] as string;
    expect(url).toContain('page=3');
    expect(url).toContain('limit=100');
  });
});

// ── useAuditVerify ────────────────────────────────────────────────────────────

describe('useAuditVerify', () => {
  it('fetches verify data when from and to are provided', async () => {
    const { api } = await import('../../../api/client');
    const data = { valid: true, count: 10, hash: 'abc' };
    vi.mocked(api.get).mockResolvedValue(data);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuditVerify('2024-01-01', '2024-12-31'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(api.get).mock.calls[0][0]).toContain('/audit-logs/verify');
  });

  it('is disabled when from is undefined', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuditVerify(undefined, '2024-12-31'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is disabled when to is undefined', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuditVerify('2024-01-01', undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is disabled when both from and to are undefined', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuditVerify(undefined, undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
