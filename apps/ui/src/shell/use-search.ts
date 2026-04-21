import { api } from '@/api/client';
// TanStack Query hook for command-palette live search — /search?q=&limit=20
// Debounces 250ms before firing. Returns empty results when query < 2 chars.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

export interface SearchResult {
  type: 'user' | 'withdrawal' | 'sweep' | 'deposit';
  id: string;
  label: string;
  subtitle: string;
  href: string;
}

interface SearchResponse {
  results: SearchResult[];
}

/** 250ms debounce — returns the debounced value. */
function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function useSearch(query: string): { results: SearchResult[]; isLoading: boolean } {
  const debouncedQ = useDebounce(query.trim(), 250);
  const enabled = debouncedQ.length >= 2;

  const { data, isFetching } = useQuery<SearchResponse>({
    queryKey: ['search', debouncedQ],
    queryFn: () => api.get<SearchResponse>(`/search?q=${encodeURIComponent(debouncedQ)}&limit=20`),
    enabled,
    // Keep previous results visible while fetching next set (less flicker)
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });

  const results = useMemo(() => (enabled ? (data?.results ?? []) : []), [enabled, data]);

  return { results, isLoading: isFetching && enabled };
}
