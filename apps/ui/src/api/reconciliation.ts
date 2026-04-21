// Reconciliation API client — typed wrappers for snapshot + drift endpoints
import type {
  ReconciliationDrift,
  ReconciliationSnapshot,
  RunSnapshotBody,
  SnapshotDetailResponse,
  SnapshotListResponse,
} from '@wp/shared-types';
import { api } from './client';

// ── List ──────────────────────────────────────────────────────────────────────

export interface SnapshotListParams {
  page?: number;
  limit?: number;
  status?: ReconciliationSnapshot['status'];
}

export function fetchSnapshots(params: SnapshotListParams = {}): Promise<SnapshotListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.status) qs.set('status', params.status);
  const query = qs.toString();
  return api.get<SnapshotListResponse>(`/reconciliation/snapshots${query ? `?${query}` : ''}`);
}

// ── Detail ────────────────────────────────────────────────────────────────────

export function fetchSnapshotDetail(id: string): Promise<SnapshotDetailResponse> {
  return api.get<SnapshotDetailResponse>(`/reconciliation/snapshots/${id}`);
}

// ── Trigger ───────────────────────────────────────────────────────────────────

export interface RunSnapshotResponse {
  jobId: string;
  message: string;
}

export function triggerSnapshot(body: RunSnapshotBody = {}): Promise<RunSnapshotResponse> {
  return api.post<RunSnapshotResponse>('/reconciliation/run', body);
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export function cancelSnapshot(id: string): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`/reconciliation/snapshots/${id}/cancel`);
}

// ── Re-exports for consumers ──────────────────────────────────────────────────

export type { ReconciliationSnapshot, ReconciliationDrift };
