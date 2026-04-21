import {
  type PatchNotificationPrefsBody,
  fetchNotificationPrefs,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  patchNotificationPrefs,
} from '@/api/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
// TanStack Query hooks for notifications — list, unread count, mark-read, prefs
import type { NotificationPrefs } from '@wp/shared-types';

// ── Query keys ────────────────────────────────────────────────────────────────

export const notifKeys = {
  all: ['notifications'] as const,
  list: (limit?: number) => ['notifications', 'list', limit] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
  prefs: () => ['notifications', 'prefs'] as const,
};

// ── Read hooks ────────────────────────────────────────────────────────────────

/** Fetch the latest notifications (default limit 50). */
export function useNotifications(limit = 50) {
  return useQuery({
    queryKey: notifKeys.list(limit),
    queryFn: () => fetchNotifications(limit),
    staleTime: 30_000,
  });
}

/** Fetch the current unread count badge value. */
export function useUnreadCount() {
  return useQuery({
    queryKey: notifKeys.unreadCount(),
    queryFn: fetchUnreadCount,
    staleTime: 10_000,
  });
}

/** Fetch the staff member's notification channel + event-type prefs. */
export function useNotificationPrefs() {
  return useQuery({
    queryKey: notifKeys.prefs(),
    queryFn: fetchNotificationPrefs,
    staleTime: 60_000,
  });
}

// ── Mutation hooks ────────────────────────────────────────────────────────────

/** Mark a single notification as read. Invalidates list + unread count. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notifKeys.all });
    },
  });
}

/** Mark all notifications as read. Invalidates list + unread count. */
export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notifKeys.all });
    },
  });
}

/** Patch the staff member's notification prefs. */
export function usePatchNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchNotificationPrefsBody) => patchNotificationPrefs(body),
    onSuccess: (updated: NotificationPrefs) => {
      qc.setQueryData(notifKeys.prefs(), updated);
    },
  });
}
