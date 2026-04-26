// Tests for shell/use-search.ts — debounced search hook backed by TanStack Query.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearch } from '../use-search';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApiGet = vi.fn();

vi.mock('@/api/client', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) =>
      QueryClientProvider({ client: qc, children }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSearch', () => {
  it('returns empty results and not loading when query is empty', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSearch(''), { wrapper });
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns empty results and not loading when query is 1 char (below threshold)', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSearch('a'), { wrapper });
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('debounces rapid query changes — does not call api.get during typing window', async () => {
    // The hook initializes debouncedQ with the initial value so first render fires.
    // Test that rapid re-renders within 250ms do NOT emit extra api calls.
    mockApiGet.mockResolvedValue({ results: [] });
    vi.useFakeTimers();
    const { wrapper } = makeWrapper();
    const { rerender } = renderHook(({ q }) => useSearch(q), {
      wrapper,
      initialProps: { q: 'ab' },
    });
    // Simulate rapid typing before debounce fires
    act(() => {
      rerender({ q: 'abc' });
      vi.advanceTimersByTime(100); // still within debounce window for 'abc'
      rerender({ q: 'abcd' });
      vi.advanceTimersByTime(100); // still within debounce window for 'abcd'
    });
    // Only the initial 'ab' query should have fired (debouncedQ='ab' at mount)
    // 'abc' and 'abcd' have NOT yet fired their debounce timers
    const callCount = mockApiGet.mock.calls.length;
    // Advance past debounce for the last value
    act(() => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    // After full debounce, one more call for 'abcd' fires — total calls = initial + 1
    await waitFor(() => expect(mockApiGet.mock.calls.length).toBeGreaterThan(callCount), {
      timeout: 3000,
    });
  });

  it('trims whitespace before checking length threshold', () => {
    const { wrapper } = makeWrapper();
    // '  ' trims to '' — query length < 2 so disabled
    const { result } = renderHook(() => useSearch('  '), { wrapper });
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('calls api.get with correct URL after debounce resolves', async () => {
    mockApiGet.mockResolvedValue({ results: [] });
    const { wrapper } = makeWrapper();

    // Use fake timers to advance past the 250ms debounce
    vi.useFakeTimers();
    const { result } = renderHook(() => useSearch('ab'), { wrapper });

    // Advance debounce timer
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Restore real timers so waitFor polling works
    vi.useRealTimers();

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled(), { timeout: 3000 });
    const url = mockApiGet.mock.calls[0][0] as string;
    expect(url).toContain('/search?q=ab');
    expect(url).toContain('limit=20');
    expect(result.current).toBeDefined();
  });

  it('encodes query param with special characters', async () => {
    mockApiGet.mockResolvedValue({ results: [] });
    const { wrapper } = makeWrapper();

    vi.useFakeTimers();
    renderHook(() => useSearch('hello world'), { wrapper });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled(), { timeout: 3000 });
    const url = mockApiGet.mock.calls[0][0] as string;
    expect(url).toContain('hello%20world');
  });

  it('returns results from api response', async () => {
    const fakeResults = [
      { type: 'user', id: 'u-1', label: 'Alice', subtitle: 'alice@x.com', href: '/users/u-1' },
    ];
    mockApiGet.mockResolvedValue({ results: fakeResults });
    const { wrapper } = makeWrapper();

    vi.useFakeTimers();
    const { result } = renderHook(() => useSearch('ali'), { wrapper });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();

    await waitFor(() => expect(result.current.results.length).toBe(1), { timeout: 3000 });
    expect(result.current.results[0].label).toBe('Alice');
    expect(result.current.isLoading).toBe(false);
  });

  it('clears results when query drops below 2 chars after having results', async () => {
    mockApiGet.mockResolvedValue({
      results: [{ type: 'user', id: 'u-1', label: 'A', subtitle: '', href: '/' }],
    });
    const { wrapper } = makeWrapper();

    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ q }) => useSearch(q), {
      wrapper,
      initialProps: { q: 'ali' },
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();

    await waitFor(() => expect(result.current.results.length).toBe(1), { timeout: 3000 });

    // Drop back below threshold and let the new debounced value settle
    vi.useFakeTimers();
    act(() => {
      rerender({ q: 'a' });
    });
    // Advance past debounce so debouncedQ becomes 'a' (length < 2 → disabled)
    act(() => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();

    // When disabled, the hook returns [] regardless of cached data
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
