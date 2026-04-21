// TanStack Query hook for audit logs — paginated with filter params
// Invalidated on Socket.io 'audit.created' event via audit-socket-listener.ts
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { AuditListResponse, AuditLogEntry, AuditVerifyResponse } from '@wp/shared-types';
import { api } from '../../api/client';

export type { AuditLogEntry };

export interface AuditLogsParams {
  page?: number;
  limit?: number;
  entity?: string;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
}

export const AUDIT_QUERY_KEY = 'audit';

export function useAuditLogs(params: AuditLogsParams = {}): UseQueryResult<AuditListResponse> {
  const { page = 1, limit = 50, entity, actor, action, from, to } = params;

  const searchParams = new URLSearchParams();
  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));
  if (entity) searchParams.set('entity', entity);
  if (actor) searchParams.set('actor', actor);
  if (action) searchParams.set('action', action);
  if (from) searchParams.set('from', from);
  if (to) searchParams.set('to', to);

  return useQuery<AuditListResponse>({
    queryKey: [AUDIT_QUERY_KEY, params],
    queryFn: () => api.get<AuditListResponse>(`/audit-logs?${searchParams.toString()}`),
    // 15s polling fallback — socket listener provides faster invalidation
    refetchInterval: 15_000,
    staleTime: 14_000,
  });
}

export function useAuditVerify(
  from: string | undefined,
  to: string | undefined
): UseQueryResult<AuditVerifyResponse> {
  const enabled = Boolean(from && to);
  return useQuery<AuditVerifyResponse>({
    queryKey: [AUDIT_QUERY_KEY, 'verify', from, to],
    queryFn: () => api.get<AuditVerifyResponse>(`/audit-logs/verify?from=${from}&to=${to}`),
    enabled,
    staleTime: 60_000,
  });
}
