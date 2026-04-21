// Recovery API client — typed wrappers around GET /recovery/stuck + POST bump/cancel
import type { BumpTxResponse, CancelTxResponse, StuckTxListResponse } from '@wp/shared-types';
import { api } from './client';

// ── Read ──────────────────────────────────────────────────────────────────────

/** GET /recovery/stuck — returns stuck tx list with thresholds used */
export function fetchStuckTxs(): Promise<StuckTxListResponse> {
  return api.get<StuckTxListResponse>('/recovery/stuck');
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export interface BumpTxBody {
  idempotencyKey: string;
}

/** POST /recovery/:entityType/:entityId/bump */
export function bumpTx(
  entityType: 'withdrawal' | 'sweep',
  entityId: string,
  body: BumpTxBody
): Promise<BumpTxResponse> {
  return api.post<BumpTxResponse>(`/recovery/${entityType}/${entityId}/bump`, body);
}

export interface CancelTxBody {
  idempotencyKey: string;
}

/** POST /recovery/:entityType/:entityId/cancel */
export function cancelTx(
  entityType: 'withdrawal' | 'sweep',
  entityId: string,
  body: CancelTxBody
): Promise<CancelTxResponse> {
  return api.post<CancelTxResponse>(`/recovery/${entityType}/${entityId}/cancel`, body);
}
