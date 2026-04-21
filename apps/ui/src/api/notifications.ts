// Notifications API client — typed wrappers around GET/POST /notifications + prefs
import type { NotificationPayload, NotificationPrefs } from '@wp/shared-types';
import { api } from './client';

// ── Response types ────────────────────────────────────────────────────────────

export interface NotificationsListResponse {
  data: NotificationPayload[];
  total: number;
}

export interface UnreadCountResponse {
  count: number;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function fetchNotifications(limit = 50): Promise<NotificationsListResponse> {
  return api.get<NotificationsListResponse>(`/notifications?limit=${limit}`);
}

export function fetchUnreadCount(): Promise<UnreadCountResponse> {
  return api.get<UnreadCountResponse>('/notifications/unread-count');
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function markNotificationRead(id: string): Promise<{ ok: true }> {
  return api.post<{ ok: true }>(`/notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<{ ok: true; updated: number }> {
  return api.post<{ ok: true; updated: number }>('/notifications/mark-all-read');
}

// ── Prefs ─────────────────────────────────────────────────────────────────────

export function fetchNotificationPrefs(): Promise<NotificationPrefs> {
  return api.get<NotificationPrefs>('/staff/me/notification-prefs');
}

export interface PatchNotificationPrefsBody {
  inApp?: boolean;
  email?: boolean;
  slack?: boolean;
  eventTypes?: Partial<NotificationPrefs['eventTypes']>;
}

export function patchNotificationPrefs(
  body: PatchNotificationPrefsBody
): Promise<NotificationPrefs> {
  return api.patch<NotificationPrefs>('/staff/me/notification-prefs', body);
}
