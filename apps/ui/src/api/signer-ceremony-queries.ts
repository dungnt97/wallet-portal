// TanStack Query hooks for signer ceremony reads + mutations.
// Separate from queries.ts to keep that file under 200 lines.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffMember } from '@wp/shared-types';
import { api } from './client';
import {
  addSigner,
  cancelCeremony,
  fetchCeremonies,
  fetchCeremony,
  removeSigner,
  rotateSigners,
} from './signers';
import type { CeremonyStatus } from './signers';

// ── Query keys ────────────────────────────────────────────────────────────────

export const ceremonyKeys = {
  all: () => ['ceremonies'] as const,
  list: (params?: { status?: CeremonyStatus; page?: number }) =>
    ['ceremonies', 'list', params] as const,
  detail: (id: string) => ['ceremony', id] as const,
  staff: (params?: { role?: string }) => ['staff', params] as const,
};

// ── Read hooks ────────────────────────────────────────────────────────────────

/** GET /signers/ceremonies — paginated list with optional status filter */
export function useCeremonies(params?: { page?: number; limit?: number; status?: CeremonyStatus }) {
  return useQuery({
    queryKey: ceremonyKeys.list(params),
    queryFn: () => fetchCeremonies(params),
    staleTime: 10_000,
  });
}

/** GET /signers/ceremonies/:id — single ceremony detail with live polling */
export function useCeremony(id: string | undefined) {
  return useQuery({
    queryKey: ceremonyKeys.detail(id ?? ''),
    queryFn: () => fetchCeremony(id!),
    enabled: Boolean(id),
    staleTime: 5_000,
    refetchInterval: (query) => {
      // Poll actively while ceremony is in flight
      const status = query.state.data?.status;
      if (status === 'pending' || status === 'in_progress') return 8_000;
      return false;
    },
  });
}

/** GET /staff — all staff members; used for staff pickers in modals */
export function useStaff(params?: { role?: string }) {
  return useQuery({
    queryKey: ceremonyKeys.staff(params),
    queryFn: async () => {
      const qs = params?.role ? `?role=${params.role}` : '';
      const res = await api.get<{ data: StaffMember[]; total: number }>(`/staff${qs}`);
      return res.data;
    },
    staleTime: 60_000,
  });
}

// ── Mutation hooks ────────────────────────────────────────────────────────────

/** POST /signers/add — triggers WebAuthn step-up via api client */
export function useAddSigner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { targetStaffId: string; reason: string }) => addSigner(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ceremonies'] });
    },
  });
}

/** POST /signers/remove */
export function useRemoveSigner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { targetStaffId: string; reason: string }) => removeSigner(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ceremonies'] });
    },
  });
}

/** POST /signers/rotate */
export function useRotateSigners() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { addStaffIds: string[]; removeStaffIds: string[]; reason: string }) =>
      rotateSigners(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ceremonies'] });
    },
  });
}

/** POST /signers/ceremonies/:id/cancel */
export function useCancelCeremony() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelCeremony(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ceremonies'] });
    },
  });
}
