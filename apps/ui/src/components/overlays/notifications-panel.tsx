import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from '@/features/notifs/use-notifications';
import { I } from '@/icons';
import { timeAgo } from '@/lib/format';
// Notifications panel — floating dropdown below the bell icon.
// Wired to real /notifications API + Socket.io live updates (Slice 5).
import type { NotificationPayload, NotificationSeverity } from '@wp/shared-types';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useToast } from './toast-host';

// ── Severity → route helper ───────────────────────────────────────────────────

/** Derive a navigation target from the notification event type + payload */
function resolveRoute(notif: NotificationPayload): string {
  const { eventType, payload } = notif;
  if (eventType.startsWith('withdrawal.') && payload?.withdrawalId) {
    return '/app/withdrawals';
  }
  if (eventType.startsWith('sweep.')) return '/app/sweep';
  if (eventType.startsWith('deposit.')) return '/app/deposits';
  if (eventType.startsWith('ops.killswitch')) return '/app/ops';
  if (eventType.startsWith('health.') || eventType.startsWith('watcher.')) {
    return '/app/architecture';
  }
  if (eventType.startsWith('cold.')) return '/app/cold';
  return '/app/audit';
}

// ── Severity color chip ───────────────────────────────────────────────────────

const SEVERITY_CLASS: Record<NotificationSeverity, string> = {
  info: 'notif-dot info',
  warning: 'notif-dot warn',
  critical: 'notif-dot err',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ open, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();

  const { data: listData, isLoading } = useNotifications(50);
  const { data: countData } = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const items = listData?.data ?? [];
  const unreadCount = countData?.count ?? 0;

  if (!open) return null;

  const handleItemClick = (notif: NotificationPayload) => {
    if (!notif.readAt) {
      markRead.mutate(notif.id);
    }
    navigate(resolveRoute(notif));
    onClose();
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => toast(t('notifications.allMarkedRead')),
    });
  };

  return (
    <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
      <div className="notif-header">
        <span className="fw-600 text-sm">
          {t('notifications.title')}
          {unreadCount > 0 && (
            <span className="notif-badge" style={{ marginLeft: 6 }}>
              {unreadCount}
            </span>
          )}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleMarkAllRead}
          disabled={markAllRead.isPending || unreadCount === 0}
        >
          {t('notifications.markAllRead')}
        </button>
      </div>

      <div className="notif-body">
        {isLoading && (
          <div className="text-sm text-muted" style={{ padding: '12px 16px' }}>
            {t('common.loading')}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="text-sm text-muted" style={{ padding: '12px 16px', textAlign: 'center' }}>
            {t('notifications.empty')}
          </div>
        )}

        {items.map((n) => {
          const isUnread = !n.readAt;
          return (
            <button
              key={n.id}
              className={`notif-row${isUnread ? '' : ' read'}`}
              onClick={() => handleItemClick(n)}
            >
              <span className={SEVERITY_CLASS[n.severity]}>
                {n.severity === 'critical' && <I.AlertTri size={12} />}
                {n.severity === 'warning' && <I.AlertTri size={12} />}
                {n.severity === 'info' && <I.Bell size={12} />}
              </span>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div className="text-sm fw-500">{n.title}</div>
                {n.body && <div className="text-xs text-muted truncate">{n.body}</div>}
                <div className="text-xs text-faint" style={{ marginTop: 2 }}>
                  {timeAgo(n.createdAt)}
                </div>
              </div>
              {isUnread && <span className="notif-unread" />}
            </button>
          );
        })}
      </div>

      <div className="notif-footer">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            navigate('/app/audit');
            onClose();
          }}
        >
          {t('notifications.viewAll')} →
        </button>
      </div>
    </div>
  );
}
