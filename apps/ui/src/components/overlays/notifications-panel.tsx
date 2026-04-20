import { I, type IconKey } from '@/icons';
import { timeAgo } from '@/lib/format';
// Notifications panel — floating dropdown below the bell icon.
// Ports prototype overlays.jsx `NotificationsPanel`. Fixture data until
// wired to /notifications API (P07+).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from './toast-host';

interface NotifItem {
  id: string;
  icon: IconKey;
  tone: 'ok' | 'warn' | 'err' | 'info';
  title: string;
  body: string;
  at: string;
  to: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ open, onClose }: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const [read, setRead] = useState<string[]>([]);

  const items: NotifItem[] = [
    {
      id: 'n1',
      icon: 'Shield',
      tone: 'warn',
      title: 'Withdrawal awaiting your signature',
      body: 'op_uv5 · 13,353.77 USDT · 1/2 collected',
      at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      to: '/app/multisig',
    },
    {
      id: 'n2',
      icon: 'ArrowDown',
      tone: 'ok',
      title: '4 deposits credited',
      body: '18,240.12 USDT across BNB and Solana',
      at: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
      to: '/app/deposits',
    },
    {
      id: 'n3',
      icon: 'Sweep',
      tone: 'info',
      title: 'Sweep run finished',
      body: '12 addresses · gas 0.013 BNB',
      at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      to: '/app/sweep',
    },
    {
      id: 'n4',
      icon: 'AlertTri',
      tone: 'err',
      title: 'RPC failover triggered',
      body: 'BSC primary degraded — switched to backup',
      at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      to: '/app/architecture',
    },
  ];

  if (!open) return null;
  return (
    <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
      <div className="notif-header">
        <span className="fw-600 text-sm">Notifications</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setRead(items.map((i) => i.id));
            toast('All marked as read.');
          }}
        >
          Mark all read
        </button>
      </div>
      <div className="notif-body">
        {items.map((n) => {
          const Icon = I[n.icon];
          const isRead = read.includes(n.id);
          return (
            <button
              key={n.id}
              className={`notif-row ${isRead ? 'read' : ''}`}
              onClick={() => {
                setRead((r) => [...r, n.id]);
                navigate(n.to);
                onClose();
              }}
            >
              <span className={`notif-dot ${n.tone}`}>
                <Icon size={12} />
              </span>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div className="text-sm fw-500">{n.title}</div>
                <div className="text-xs text-muted truncate">{n.body}</div>
                <div className="text-xs text-faint" style={{ marginTop: 2 }}>
                  {timeAgo(n.at)}
                </div>
              </div>
              {!isRead && <span className="notif-unread" />}
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
          View all in audit log →
        </button>
      </div>
    </div>
  );
}
