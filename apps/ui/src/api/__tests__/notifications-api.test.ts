import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchNotificationPrefs,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  patchNotificationPrefs,
} from '../notifications';

vi.mock('../client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

import { api } from '../client';
const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);
const mockPatch = vi.mocked(api.patch);

describe('notifications API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetchNotifications calls GET with default limit 50', () => {
    mockGet.mockResolvedValue({} as never);
    fetchNotifications();
    expect(mockGet).toHaveBeenCalledWith('/notifications?limit=50');
  });

  it('fetchNotifications uses custom limit', () => {
    mockGet.mockResolvedValue({} as never);
    fetchNotifications(20);
    expect(mockGet).toHaveBeenCalledWith('/notifications?limit=20');
  });

  it('fetchUnreadCount calls GET /notifications/unread-count', () => {
    mockGet.mockResolvedValue({} as never);
    fetchUnreadCount();
    expect(mockGet).toHaveBeenCalledWith('/notifications/unread-count');
  });

  it('markNotificationRead calls POST /notifications/:id/read', () => {
    mockPost.mockResolvedValue({} as never);
    markNotificationRead('notif-1');
    expect(mockPost).toHaveBeenCalledWith('/notifications/notif-1/read');
  });

  it('markAllNotificationsRead calls POST /notifications/mark-all-read', () => {
    mockPost.mockResolvedValue({} as never);
    markAllNotificationsRead();
    expect(mockPost).toHaveBeenCalledWith('/notifications/mark-all-read');
  });

  it('fetchNotificationPrefs calls GET /staff/me/notification-prefs', () => {
    mockGet.mockResolvedValue({} as never);
    fetchNotificationPrefs();
    expect(mockGet).toHaveBeenCalledWith('/staff/me/notification-prefs');
  });

  it('patchNotificationPrefs calls PATCH /staff/me/notification-prefs with body', () => {
    mockPatch.mockResolvedValue({} as never);
    patchNotificationPrefs({ inApp: true, email: false });
    expect(mockPatch).toHaveBeenCalledWith('/staff/me/notification-prefs', {
      inApp: true,
      email: false,
    });
  });

  it('patchNotificationPrefs handles empty body', () => {
    mockPatch.mockResolvedValue({} as never);
    patchNotificationPrefs({});
    expect(mockPatch).toHaveBeenCalledWith('/staff/me/notification-prefs', {});
  });
});
