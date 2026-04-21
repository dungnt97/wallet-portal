// Signer ceremony API client — typed wrappers around admin-api /signers/* endpoints.
// All POST routes require admin role; GET routes require signers.read perm.
import { api } from './client';

// ── Types ──────────────────────────────────────────────────────────────────────

export type CeremonyOperationType = 'signer_add' | 'signer_remove' | 'signer_rotate';

export type CeremonyStatus =
  | 'pending'
  | 'in_progress'
  | 'confirmed'
  | 'partial'
  | 'failed'
  | 'cancelled';

export type ChainCeremonyStatus =
  | 'pending'
  | 'signing'
  | 'executing'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

export interface ChainCeremonyState {
  status: ChainCeremonyStatus;
  txHash?: string;
  multisigOpId?: string;
  errorReason?: string;
}

export interface CeremonyRow {
  id: string;
  operationType: CeremonyOperationType;
  initiatedBy: string;
  targetAdd: string[];
  targetRemove: string[];
  chainStates: Record<string, ChainCeremonyState>;
  status: CeremonyStatus;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddSignerResult {
  ceremonyId: string;
  bnbOpId: string;
  solanaOpId: string;
}

export interface CeremoniesPage {
  data: CeremonyRow[];
  total: number;
  page: number;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export function addSigner(body: {
  targetStaffId: string;
  reason: string;
}): Promise<AddSignerResult> {
  return api.post<AddSignerResult>('/signers/add', body);
}

export function removeSigner(body: {
  targetStaffId: string;
  reason: string;
}): Promise<AddSignerResult> {
  return api.post<AddSignerResult>('/signers/remove', body);
}

export function rotateSigners(body: {
  addStaffIds: string[];
  removeStaffIds: string[];
  reason: string;
}): Promise<AddSignerResult> {
  return api.post<AddSignerResult>('/signers/rotate', body);
}

export function fetchCeremonies(params?: {
  page?: number;
  limit?: number;
  status?: CeremonyStatus;
}): Promise<CeremoniesPage> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);
  const q = qs.toString();
  return api.get<CeremoniesPage>(`/signers/ceremonies${q ? `?${q}` : ''}`);
}

export function fetchCeremony(id: string): Promise<CeremonyRow> {
  return api.get<CeremonyRow>(`/signers/ceremonies/${id}`);
}

export function cancelCeremony(id: string): Promise<void> {
  return api.post<void>(`/signers/ceremonies/${id}/cancel`);
}
